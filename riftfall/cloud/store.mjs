// Base de datos de la Cuenta Rift (Cloudflare D1, que es SQLite). Las tablas se crean solas la
// primera vez. Todo pasa por esta capa para que los tests usen SQLite de Node con la misma interfaz.

import { ORDER_LIMIT } from '../src/shared/purchase-order.js';

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
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, payer TEXT NOT NULL,
    json TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, tx TEXT UNIQUE)`,
  `CREATE INDEX IF NOT EXISTS orders_player_created ON purchase_orders (player_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS orders_payer_created ON purchase_orders (payer, created_at)`,
  `CREATE TABLE IF NOT EXISTS purchase_reviews (
    tx TEXT PRIMARY KEY, admin_id TEXT NOT NULL, player_id TEXT NOT NULL,
    kind TEXT NOT NULL, item TEXT NOT NULL, amount_wei TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, json TEXT NOT NULL, v INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, board TEXT NOT NULL, player_pid TEXT NOT NULL, body TEXT NOT NULL,
    claimed TEXT, status TEXT NOT NULL DEFAULT 'pending', at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS runs_status ON runs (status)`,
  // De dónde llegó cada jugador nuevo (para las estadísticas del dueño). Sin IP ni datos personales.
  `CREATE TABLE IF NOT EXISTS origins (
    player_id TEXT PRIMARY KEY, src TEXT, country TEXT, tz TEXT, lang TEXT, device TEXT, game TEXT, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS origins_at ON origins (at)`
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
    /** Cuántas sesiones abiertas quedan de antes de una fecha (para medir una revocación antes de aplicarla). */
    sessionsBefore: (cutoff, now) =>
      one(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN EXISTS (SELECT 1 FROM wallets w WHERE w.player_id = s.player_id) OR EXISTS (SELECT 1 FROM passkeys k WHERE k.player_id = s.player_id) THEN 1 ELSE 0 END) AS withCredentials
        FROM sessions s WHERE s.created_at < ? AND s.expires_at > ?`, cutoff, now),

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
    /**
     * Lo saca de la base al leerlo, en una sola operación: si dos pedidos llegan a la vez con el mismo
     * desafío, solo uno lo recibe. No se puede usar dos veces.
     */
    async takeChallenge(id, kind, now) {
      const row = await one('DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING *', id, kind);
      return row && row.expires_at > now ? row : null;
    },
    /** Borra los desafíos pendientes de un jugador de un tipo (queda uno solo vivo a la vez). */
    dropChallenges: (playerId, kind) => run('DELETE FROM challenges WHERE player_id = ? AND kind = ?', playerId, kind),
    sweep: (now) => run('DELETE FROM challenges WHERE expires_at < ?', now),

    // ---------- Origen de los jugadores y estadísticas del dueño ----------
    addOrigin: ({ playerId, src, country, tz, lang, device, game, now }) =>
      run('INSERT OR IGNORE INTO origins (player_id, src, country, tz, lang, device, game, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        playerId, src, country, tz, lang, device, game, now),
    /**
     * Resumen para el Panel del dueño. "Jugó" = tiene una partida guardada con contenido de verdad.
     * `offset` = segundos que se suman a UTC para contar los días en la hora del dueño.
     */
    async stats(now, offset = 0) {
      const PLAYED = `EXISTS (SELECT 1 FROM saves s WHERE s.player_id = p.id AND length(s.data) > 400)`;
      const day = `strftime('%Y-%m-%d', p.created_at / 1000 + ${Number(offset) | 0}, 'unixepoch')`;
      const since = now - 14 * 86_400_000;
      const month = now - 30 * 86_400_000;
      // Sin país (entró por un camino que no lo dice), se agrupa por la zona horaria del navegador.
      const group = (col, fallback) => all(`SELECT COALESCE(${col === 'country' ? 'o.country, o.tz' : `o.${col}`}, '${fallback}') AS k, COUNT(*) AS n, SUM(CASE WHEN ${PLAYED} THEN 1 ELSE 0 END) AS played
        FROM players p LEFT JOIN origins o ON o.player_id = p.id WHERE p.created_at >= ? GROUP BY k ORDER BY n DESC LIMIT 12`, month);
      const [totals, days, sources, countries, devices, games, recent, purchases] = await Promise.all([
        one(`SELECT COUNT(*) AS players, SUM(CASE WHEN ${PLAYED} THEN 1 ELSE 0 END) AS played,
          (SELECT COUNT(*) FROM wallets) AS wallets, (SELECT COUNT(*) FROM purchases) AS purchases,
          (SELECT COALESCE(SUM(usd), 0) FROM purchases) AS usd FROM players p`),
        all(`SELECT ${day} AS d, COUNT(*) AS n, SUM(CASE WHEN ${PLAYED} THEN 1 ELSE 0 END) AS played FROM players p WHERE p.created_at >= ? GROUP BY d ORDER BY d`, since),
        group('src', 'directo'),
        group('country', '?'),
        group('device', '?'),
        group('game', '?'),
        all(`SELECT p.created_at AS at, p.name, o.src, o.country, o.tz, o.device, o.game, ${PLAYED} AS played
          FROM players p LEFT JOIN origins o ON o.player_id = p.id ORDER BY p.created_at DESC LIMIT 20`),
        all('SELECT kind, item, usd, method, at FROM purchases ORDER BY at DESC LIMIT 20')
      ]);
      return { totals, days, sources, countries, devices, games, recent, purchases };
    },

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
    async canOrder(playerId, payer, now) {
      const r = await one('SELECT COUNT(*) AS n FROM purchase_orders WHERE (player_id = ? OR payer = ?) AND created_at > ?', playerId, payer, now - 86_400_000);
      return r.n < ORDER_LIMIT;
    },
    async addOrder(playerId, order) {
      const r = await run(`INSERT INTO purchase_orders (id, player_id, payer, json, created_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE
        (SELECT COUNT(*) FROM purchase_orders WHERE (player_id = ? OR payer = ?) AND created_at > ?) < ?`,
      order.id, playerId, order.payer, JSON.stringify(order), order.createdAt, order.expiresAt,
      playerId, order.payer, order.createdAt - 86_400_000, ORDER_LIMIT);
      if (!changes(r)) throw new Conflict();
    },
    async order(id) {
      const row = await one('SELECT * FROM purchase_orders WHERE id = ?', id);
      return row ? { ...JSON.parse(row.json), playerId: row.player_id, tx: row.tx } : null;
    },
    async completeOrder(orderId, { tx, playerId, kind, item, usd, method, payer, now }) {
      const result = await db.batch([
        db.prepare(`INSERT INTO purchases (tx, player_id, kind, item, usd, method, payer, at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM purchase_orders
          WHERE id = ? AND player_id = ? AND payer = ? AND tx IS NULL`)
          .bind(tx, playerId, kind, item, usd, method, payer, now, orderId, playerId, payer),
        db.prepare(`UPDATE purchase_orders SET tx = ? WHERE id = ? AND tx IS NULL
          AND EXISTS (SELECT 1 FROM purchases WHERE tx = ? AND player_id = ?)`)
          .bind(tx, orderId, tx, playerId)
      ]);
      if (!changes(result[0])) throw new Conflict();
    },
    async reviewPurchase({ tx, adminId, playerId, kind, item, amountWei, reason, payer, method = 'bnb-manual', orderId = null, now }) {
      const statements = [
        db.prepare(`INSERT INTO purchases (tx, player_id, kind, item, usd, method, payer, at)
          SELECT ?, ?, ?, ?, NULL, ?, ?, ? WHERE ? IS NULL OR EXISTS
          (SELECT 1 FROM purchase_orders WHERE id = ? AND payer = ? AND tx IS NULL)`)
          .bind(tx, playerId, kind, item, method, payer, now, orderId, orderId, payer),
        db.prepare(`INSERT INTO purchase_reviews (tx, admin_id, player_id, kind, item, amount_wei, reason, at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM purchases WHERE tx = ?)`)
          .bind(tx, adminId, playerId, kind, item, amountWei, reason, now, tx)
      ];
      if (orderId) statements.push(db.prepare(`UPDATE purchase_orders SET tx = ? WHERE id = ? AND tx IS NULL
        AND EXISTS (SELECT 1 FROM purchases WHERE tx = ?)` ).bind(tx, orderId, tx));
      const result = await db.batch(statements);
      if (!changes(result[0])) throw new Conflict();
    },
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
