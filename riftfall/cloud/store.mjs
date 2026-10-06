// Base de datos de la Cuenta Rift (Cloudflare D1, que es SQLite). Las tablas se crean solas la
// primera vez. Todo pasa por esta capa para que los tests usen SQLite de Node con la misma interfaz.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, pid TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id)`,
  `CREATE TABLE IF NOT EXISTS wallets (
    address TEXT PRIMARY KEY, player_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS wallets_player ON wallets (player_id)`,
  `CREATE TABLE IF NOT EXISTS passkeys (
    cred_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT, device TEXT, created_at INTEGER NOT NULL, used_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS passkeys_player ON passkeys (player_id)`,
  `CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL, player_id TEXT, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS saves (
    player_id TEXT NOT NULL, game TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (player_id, game))`,
  `CREATE TABLE IF NOT EXISTS purchases (
    tx TEXT PRIMARY KEY, player_id TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL,
    usd REAL, method TEXT, payer TEXT, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS purchases_player ON purchases (player_id)`,
  `CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, json TEXT NOT NULL, v INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, board TEXT NOT NULL, player_pid TEXT NOT NULL, body TEXT NOT NULL,
    claimed TEXT, status TEXT NOT NULL DEFAULT 'pending', at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS runs_status ON runs (status)`
];

const ready = new WeakMap();

/** Crea las tablas (una vez por base y por proceso). */
export function ensureSchema(db) {
  if (!ready.has(db)) ready.set(db, db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => {
    ready.delete(db);
    throw err;
  }));
  return ready.get(db);
}

export class Conflict extends Error {}

/** Consultas de la cuenta, sobre una base con la interfaz de D1. */
export function createStore(db) {
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results ?? [];
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
  const changes = (r) => r?.meta?.changes ?? r?.changes ?? 0;

  return {
    // ---------- Jugadores y sesiones ----------
    player: (id) => one('SELECT * FROM players WHERE id = ?', id),
    playerByPid: (pid) => one('SELECT * FROM players WHERE pid = ?', pid),
    async createPlayer({ id, pid, name = '', now }) {
      await run('INSERT INTO players (id, pid, name, created_at, seen_at) VALUES (?, ?, ?, ?, ?)', id, pid, name, now, now);
      return this.player(id);
    },
    setName: (id, name) => run('UPDATE players SET name = ? WHERE id = ?', name, id),
    touch: (id, now) => run('UPDATE players SET seen_at = ? WHERE id = ?', now, id),
    addSession: (hash, playerId, now, expires) =>
      run('INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)', hash, playerId, now, expires),
    session: (hash, now) => one('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', hash, now),
    dropSession: (hash) => run('DELETE FROM sessions WHERE token_hash = ?', hash),

    // ---------- Credenciales ----------
    wallets: async (playerId) => (await all('SELECT address FROM wallets WHERE player_id = ? ORDER BY created_at', playerId)).map((r) => r.address),
    walletOwner: async (address) => (await one('SELECT player_id FROM wallets WHERE address = ?', address))?.player_id ?? null,
    addWallet: (address, playerId, now) => run('INSERT INTO wallets (address, player_id, created_at) VALUES (?, ?, ?)', address, playerId, now),
    passkeys: (playerId) => all('SELECT cred_id, device, created_at, used_at FROM passkeys WHERE player_id = ? ORDER BY created_at', playerId),
    passkey: (credId) => one('SELECT * FROM passkeys WHERE cred_id = ?', credId),
    addPasskey: ({ credId, playerId, publicKey, counter, transports, device, now }) =>
      run('INSERT INTO passkeys (cred_id, player_id, public_key, counter, transports, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        credId, playerId, publicKey, counter, transports, device, now),
    usePasskey: (credId, counter, now) => run('UPDATE passkeys SET counter = ?, used_at = ? WHERE cred_id = ?', counter, now, credId),
    async hasCredentials(playerId) {
      const r = await one('SELECT (SELECT COUNT(*) FROM wallets WHERE player_id = ?) + (SELECT COUNT(*) FROM passkeys WHERE player_id = ?) AS n', playerId, playerId);
      return (r?.n ?? 0) > 0;
    },

    // ---------- Desafíos de un solo uso (firma de wallet, passkeys) ----------
    addChallenge: ({ id, kind, value, playerId = null, expires }) =>
      run('INSERT INTO challenges (id, kind, value, player_id, expires_at) VALUES (?, ?, ?, ?, ?)', id, kind, value, playerId, expires),
    /** Lo saca de la base al leerlo: no se puede usar dos veces. */
    async takeChallenge(id, kind, now) {
      const row = await one('SELECT * FROM challenges WHERE id = ? AND kind = ?', id, kind);
      if (!row) return null;
      await run('DELETE FROM challenges WHERE id = ?', id);
      return row.expires_at > now ? row : null;
    },
    sweep: (now) => run('DELETE FROM challenges WHERE expires_at < ?', now),

    // ---------- Partidas guardadas ----------
    save: (playerId, game) => one('SELECT data, rev, updated_at FROM saves WHERE player_id = ? AND game = ?', playerId, game),
    /** Guarda si la versión coincide (si otro dispositivo guardó antes, avisa con Conflict). */
    async putSave(playerId, game, data, rev, now) {
      if (rev === 0) {
        const r = await run('INSERT OR IGNORE INTO saves (player_id, game, data, rev, updated_at) VALUES (?, ?, ?, 1, ?)', playerId, game, data, now);
        if (!changes(r)) throw new Conflict();
        return 1;
      }
      const r = await run('UPDATE saves SET data = ?, rev = rev + 1, updated_at = ? WHERE player_id = ? AND game = ? AND rev = ?', data, now, playerId, game, rev);
      if (!changes(r)) throw new Conflict();
      return rev + 1;
    },

    // ---------- Compras ----------
    purchases: (playerId) => all('SELECT tx, kind, item, usd, method, payer, at FROM purchases WHERE player_id = ? ORDER BY at', playerId),
    purchase: (tx) => one('SELECT * FROM purchases WHERE tx = ?', tx),
    addPurchase: ({ tx, playerId, kind, item, usd, method, payer, now }) =>
      run('INSERT INTO purchases (tx, player_id, kind, item, usd, method, payer, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', tx, playerId, kind, item, usd, method, payer, now),
    /** Al entrar a una cuenta desde un invitado sin credenciales, sus compras pasan a la cuenta. */
    movePurchases: (from, to) => run('UPDATE purchases SET player_id = ? WHERE player_id = ?', to, from),

    // ---------- Documentos (rankings) con control de versión ----------
    async doc(key) {
      const row = await one('SELECT json, v FROM docs WHERE key = ?', key);
      return row ? { data: JSON.parse(row.json), v: row.v } : { data: null, v: 0 };
    },
    async putDoc(key, data, v) {
      const json = JSON.stringify(data);
      const r = v === 0
        ? await run('INSERT OR IGNORE INTO docs (key, json, v) VALUES (?, ?, 1)', key, json)
        : await run('UPDATE docs SET json = ?, v = v + 1 WHERE key = ? AND v = ?', json, key, v);
      if (!changes(r)) throw new Conflict();
    },

    // ---------- Partidas para verificar después ----------
    addRun: ({ board, pid, body, claimed, now }) =>
      run('INSERT INTO runs (board, player_pid, body, claimed, at) VALUES (?, ?, ?, ?, ?)', board, pid, body, claimed, now),
    pendingRuns: (limit) => all("SELECT id, board, player_pid, body, claimed, at FROM runs WHERE status = 'pending' ORDER BY id LIMIT ?", limit),
    setRunStatus: (id, status) => run('UPDATE runs SET status = ? WHERE id = ?', status, id)
  };
}
