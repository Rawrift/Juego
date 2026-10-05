// Servidor de RIFTFALL: API del juego + archivos estáticos del cliente.
//
// Flujo anti-trampas ("Proof of Play"):
//   1. /api/run/start entrega una semilla aleatoria y fija la nave (verificada on-chain).
//   2. El cliente juega y graba sus entradas.
//   3. /api/run/finish re-simula la partida completa en un worker; la recompensa sale del
//      resultado del servidor, nunca de lo que diga el cliente. Además se exige que la partida
//      haya durado en tiempo real lo que dice la simulación (anti speed-hack).
//   4. Los Shards se canjean por RIFT con vales EIP-712 que el contrato RewardVault limita.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyMessage, getAddress, formatEther } from 'ethers';
import { openDb } from './db.mjs';
import { createReplayPool } from './replay-pool.mjs';
import { initChain } from './chain.mjs';
import { MISSIONS, dayKey, previousDayKey, streakBonus, freshDaily, applyRunToDaily, missionView } from './economy.mjs';
import { SHIPS, SHIP_BY_CLASS, TICK_RATE, MAX_INPUT_NUMBERS } from '../src/sim/index.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);
const ARENA_PAYOUT = [3000, 2000, 1200, 900, 800, 700, 500, 400, 300, 200];

export async function createApp(options = {}) {
  const cfg = {
    port: 8787,
    host: '0.0.0.0',
    dataDir: path.join(ROOT, 'server', 'data'),
    staticDir: path.join(ROOT, 'dist'),
    rpcUrl: '',
    publicRpcUrl: '',
    explorerUrl: '',
    deploymentFile: '',
    signerKey: '',
    riftPerShard: 1,
    minClaimShards: 100,
    minRealtimeRatio: 0.9,
    demoShips: false,
    adminToken: '',
    arenaAuto: false,
    arenaFee: 100,
    arenaHours: 24,
    replayWorkers: undefined,
    ...options
  };

  const db = openDb(cfg.dataDir);
  const D = db.data;
  const pool = createReplayPool(cfg.replayWorkers);
  let chain = null;
  try {
    chain = await initChain(cfg);
  } catch (err) {
    console.warn(`Blockchain desactivada: ${err.message}`);
  }
  const riftPerShardWei = BigInt(Math.round(cfg.riftPerShard * 1e6)) * 10n ** 12n;
  const nonces = new Map();
  const buckets = new Map();

  // --------------------------------------------------------------- utilidades

  const newToken = () => crypto.randomBytes(24).toString('hex');
  const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);

  function rateLimit(ip, key, perMinute) {
    const k = `${ip}|${key}`;
    const now = Date.now();
    const b = buckets.get(k) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
    b.at = now;
    if (b.tokens < 1) throw new HttpError(429, 'Demasiadas solicitudes, espera un momento');
    b.tokens -= 1;
    if (buckets.size > 50_000) buckets.clear();
    buckets.set(k, b);
  }

  function newPlayer() {
    const id = `p_${crypto.randomBytes(8).toString('hex')}`;
    const p = {
      id,
      name: `Piloto-${id.slice(2, 6).toUpperCase()}`,
      wallet: null,
      createdAt: Date.now(),
      shards: 0,
      lifetimeShards: 0,
      runs: 0,
      bestScore: 0,
      bestTime: 0,
      kills: 0,
      bosses: 0,
      victories: 0,
      streak: 0,
      lastDay: '',
      daily: freshDaily(dayKey())
    };
    D.players[id] = p;
    return p;
  }

  function auth(req) {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const pid = D.sessions[token];
    const p = pid && D.players[pid];
    if (!p) throw new HttpError(401, 'Sesión inválida');
    rollDaily(p);
    return p;
  }

  function rollDaily(p) {
    const today = dayKey();
    if (p.daily?.day !== today) p.daily = freshDaily(today);
  }

  function rollLeaderboard() {
    const today = dayKey();
    if (D.leaderboard.day !== today) {
      D.leaderboard.day = today;
      D.leaderboard.daily = {};
    }
  }

  function pendingClaimsWei(filter) {
    let total = 0n;
    const now = Math.floor(Date.now() / 1000);
    for (const c of Object.values(D.claims)) {
      if (c.status === 'pending' && c.deadline >= now && filter(c)) total += BigInt(c.amountWei);
    }
    return total;
  }

  async function reconcileClaims(p) {
    if (!chain) return;
    const now = Math.floor(Date.now() / 1000);
    for (const c of Object.values(D.claims)) {
      if (c.playerId !== p.id || c.status !== 'pending') continue;
      try {
        if (await chain.vault.claimUsed(BigInt(c.id))) {
          c.status = 'paid';
          D.stats.shardsClaimed += c.shards;
        } else if (now > c.deadline + 120) {
          c.status = 'expired';
          p.shards += c.shards; // el vale ya no se puede cobrar on-chain: se devuelven los Shards
        }
      } catch {
        // RPC caído: se reintenta en la próxima consulta
      }
    }
    db.save();
  }

  function profileView(p) {
    return {
      id: p.id,
      name: p.name,
      wallet: p.wallet,
      shards: p.shards,
      lifetimeShards: p.lifetimeShards,
      runs: p.runs,
      bestScore: p.bestScore,
      bestTime: p.bestTime,
      kills: p.kills,
      bosses: p.bosses,
      victories: p.victories,
      streak: p.streak,
      missions: missionView(p.daily),
      claims: Object.values(D.claims)
        .filter((c) => c.playerId === p.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10)
        .map((c) => ({ ...c, signature: c.status === 'pending' ? c.signature : undefined }))
    };
  }

  function leaderboardView(map) {
    return Object.entries(map)
      .map(([pid, e]) => ({ ...e, name: D.players[pid]?.name ?? '???', wallet: shortAddr(D.players[pid]?.wallet) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  async function resolveShip(p, body) {
    const tokenId = body.shipTokenId;
    if (tokenId === undefined || tokenId === null || tokenId === '') return { ship: 'spark', shipLevel: 1, tokenId: null };
    if (cfg.demoShips && !chain && typeof body.demoShip === 'string' && SHIPS[body.demoShip]) {
      return { ship: body.demoShip, shipLevel: 1, tokenId: null };
    }
    if (!chain) throw bad('Las naves NFT requieren la blockchain configurada');
    if (!p.wallet) throw bad('Conecta tu wallet para usar naves NFT');
    let info;
    try {
      info = await chain.ship(BigInt(tokenId));
    } catch {
      throw bad('Nave inexistente');
    }
    if (info.owner.toLowerCase() !== p.wallet.toLowerCase()) throw bad('Esa nave no está en tu wallet');
    const ship = SHIP_BY_CLASS[info.classId];
    if (!ship) throw bad('Clase de nave desconocida');
    return { ship, shipLevel: info.level, tokenId: String(tokenId) };
  }

  function activeTournament() {
    const now = Date.now();
    return Object.values(D.tournaments).find((t) => !t.settled && t.endsAt * 1000 > now) ?? null;
  }

  // --------------------------------------------------------------- rutas

  const routes = {
    'GET /api/health': async () => ({ ok: true, chain: !!chain, time: Date.now() }),

    'GET /api/config': async () => ({
      chain: chain
        ? {
            chainId: chain.deployment.chainId,
            network: chain.deployment.network,
            contracts: chain.deployment.contracts,
            rpcUrl: cfg.publicRpcUrl || cfg.rpcUrl,
            explorerUrl: cfg.explorerUrl
          }
        : null,
      riftPerShard: cfg.riftPerShard,
      minClaimShards: cfg.minClaimShards,
      demoShips: cfg.demoShips && !chain,
      missions: MISSIONS,
      tickRate: TICK_RATE
    }),

    'POST /api/auth/guest': async ({ ip }) => {
      rateLimit(ip, 'guest', 10);
      const p = newPlayer();
      const token = newToken();
      D.sessions[token] = p.id;
      db.save();
      return { token, profile: profileView(p) };
    },

    'POST /api/auth/nonce': async ({ ip, body }) => {
      rateLimit(ip, 'nonce', 20);
      let address;
      try {
        address = getAddress(String(body.address ?? ''));
      } catch {
        throw bad('Dirección inválida');
      }
      const nonce = crypto.randomBytes(12).toString('hex');
      const message =
        `RIFTFALL — iniciar sesión\n\nWallet: ${address}\nNonce: ${nonce}\nFecha: ${new Date().toISOString()}\n\n` +
        'Esta firma no cuesta gas ni autoriza ninguna transacción.';
      nonces.set(address.toLowerCase(), { message, exp: Date.now() + 10 * 60_000 });
      return { message };
    },

    'POST /api/auth/wallet': async ({ ip, req, body }) => {
      rateLimit(ip, 'wallet', 20);
      let address;
      try {
        address = getAddress(String(body.address ?? ''));
      } catch {
        throw bad('Dirección inválida');
      }
      const entry = nonces.get(address.toLowerCase());
      if (!entry || entry.exp < Date.now()) throw bad('Nonce vencido, vuelve a intentarlo');
      let signer;
      try {
        signer = verifyMessage(entry.message, String(body.signature ?? ''));
      } catch {
        throw bad('Firma inválida');
      }
      if (signer.toLowerCase() !== address.toLowerCase()) throw bad('La firma no corresponde a la wallet');
      nonces.delete(address.toLowerCase());

      const key = address.toLowerCase();
      let p = D.wallets[key] && D.players[D.wallets[key]];
      if (!p) {
        // Si hay una sesión de invitado sin wallet, se le vincula la wallet y conserva su progreso.
        let guest = null;
        try {
          guest = auth(req);
        } catch {
          guest = null;
        }
        p = guest && !guest.wallet ? guest : newPlayer();
        p.wallet = address;
        D.wallets[key] = p.id;
      }
      const token = newToken();
      D.sessions[token] = p.id;
      db.save();
      return { token, profile: profileView(p) };
    },

    'GET /api/profile': async ({ req }) => {
      const p = auth(req);
      await reconcileClaims(p);
      return { profile: profileView(p) };
    },

    'POST /api/profile/name': async ({ req, body }) => {
      const p = auth(req);
      const name = String(body.name ?? '').trim();
      if (!/^[\p{L}\p{N}_\- ]{3,16}$/u.test(name)) throw bad('Nombre: 3 a 16 letras, números, espacio, _ o -');
      p.name = name;
      db.save();
      return { profile: profileView(p) };
    },

    'GET /api/ships': async ({ req }) => {
      const p = auth(req);
      if (!chain || !p.wallet) return { ships: [] };
      const owned = await chain.shipsOf(p.wallet);
      return { ships: owned.map((s) => ({ ...s, key: SHIP_BY_CLASS[s.classId] ?? null })) };
    },

    'POST /api/run/start': async ({ ip, req, body }) => {
      rateLimit(ip, 'start', 30);
      const p = auth(req);
      const mode = body.mode === 'arena' ? 'arena' : 'normal';
      let ship = { ship: 'spark', shipLevel: 1, tokenId: null };
      let tournamentId = null;
      if (mode === 'arena') {
        const t = activeTournament();
        if (!t) throw bad('No hay torneo activo');
        if (!p.wallet) throw bad('Conecta tu wallet para jugar la Arena');
        if (chain && !(await chain.arena.entered(BigInt(t.id), p.wallet))) throw bad('Primero inscríbete en el torneo');
        tournamentId = t.id;
      } else {
        ship = await resolveShip(p, body);
      }
      for (const r of Object.values(D.runs)) {
        if (r.playerId === p.id && r.status === 'active') r.status = 'abandoned';
      }
      const id = `r_${crypto.randomBytes(10).toString('hex')}`;
      const seed = crypto.randomBytes(4).readUInt32LE(0);
      D.runs[id] = { id, playerId: p.id, mode, seed, ...ship, tournamentId, startedAt: Date.now(), status: 'active' };
      D.stats.totalRuns++;
      db.save();
      return { runId: id, seed, ship: ship.ship, shipLevel: ship.shipLevel, mode, tournamentId };
    },

    'POST /api/run/finish': async ({ ip, req, body }) => {
      rateLimit(ip, 'finish', 30);
      const p = auth(req);
      const run = D.runs[String(body.runId ?? '')];
      if (!run || run.playerId !== p.id) throw bad('Partida desconocida');
      if (run.status !== 'active') throw bad('La partida ya fue procesada');
      const { inputs, choices } = body;
      if (!Array.isArray(inputs) || inputs.length > MAX_INPUT_NUMBERS) throw bad('Entradas inválidas');
      run.status = 'verifying';

      const result = await pool.run({ seed: run.seed, ship: run.ship, shipLevel: run.shipLevel, inputs, choices });
      if (!result.ok) {
        run.status = 'rejected';
        run.reason = result.error;
        D.stats.rejectedRuns++;
        db.save();
        throw bad(`Partida rechazada: ${result.error}`);
      }
      const sum = result.summary;
      const elapsedMs = Date.now() - run.startedAt;
      const minMs = (sum.ticks / TICK_RATE) * 1000 * cfg.minRealtimeRatio - 3000;
      if (elapsedMs < minMs) {
        run.status = 'rejected';
        run.reason = 'tiempo real insuficiente';
        D.stats.rejectedRuns++;
        db.save();
        throw bad('Partida rechazada: la duración real no coincide con la simulada');
      }

      run.status = 'verified';
      run.summary = sum;
      run.hash = result.hash;
      run.finishedAt = Date.now();
      run.inputs = inputs;
      run.choices = choices;
      D.stats.verifiedRuns++;

      const rewards = { run: 0, streak: 0, missions: [] };
      if (run.mode === 'normal') {
        rewards.run = sum.shardsEarned;
        const today = dayKey();
        if (p.lastDay !== today) {
          p.streak = p.lastDay === previousDayKey() ? p.streak + 1 : 1;
          p.lastDay = today;
          rewards.streak = streakBonus(p.streak);
        }
        for (const m of applyRunToDaily(p.daily, sum)) rewards.missions.push({ id: m.id, name: m.name, reward: m.reward });
      } else {
        const t = D.tournaments[run.tournamentId];
        const key = p.wallet.toLowerCase();
        if (t && !t.settled && (!t.scores[key] || t.scores[key].score < sum.score)) {
          t.scores[key] = { score: sum.score, runId: run.id, wallet: p.wallet, name: p.name, timeSec: sum.timeSec };
        }
      }
      const total = rewards.run + rewards.streak + rewards.missions.reduce((a, m) => a + m.reward, 0);
      p.shards += total;
      p.lifetimeShards += total;
      D.stats.shardsIssued += total;
      p.runs++;
      p.kills += sum.kills;
      p.bosses += sum.bossesKilled;
      if (sum.victory) p.victories++;
      p.bestTime = Math.max(p.bestTime, sum.timeSec);

      if (run.mode === 'normal') {
        rollLeaderboard();
        const entry = { score: sum.score, timeSec: sum.timeSec, kills: sum.kills, ship: run.ship, runId: run.id };
        if (!D.leaderboard.daily[p.id] || D.leaderboard.daily[p.id].score < sum.score) D.leaderboard.daily[p.id] = entry;
        if (!D.leaderboard.allTime[p.id] || D.leaderboard.allTime[p.id].score < sum.score) D.leaderboard.allTime[p.id] = entry;
        p.bestScore = Math.max(p.bestScore, sum.score);
      }
      pruneReplays();
      db.save();
      return { summary: sum, rewards, totalShards: total, profile: profileView(p) };
    },

    'GET /api/leaderboard': async ({ url }) => {
      rollLeaderboard();
      const scope = url.searchParams.get('scope') === 'all' ? 'allTime' : 'daily';
      return { scope, entries: leaderboardView(D.leaderboard[scope]) };
    },

    'GET /api/replay': async ({ url }) => {
      const run = D.runs[url.searchParams.get('id') ?? ''];
      if (!run || run.status !== 'verified' || !run.inputs) throw new HttpError(404, 'Replay no disponible');
      return {
        id: run.id,
        seed: run.seed,
        ship: run.ship,
        shipLevel: run.shipLevel,
        inputs: run.inputs,
        choices: run.choices,
        summary: run.summary,
        hash: run.hash
      };
    },

    'POST /api/claim': async ({ ip, req, body }) => {
      rateLimit(ip, 'claim', 10);
      const p = auth(req);
      if (!chain) throw bad('Canje no disponible: blockchain no configurada');
      if (!p.wallet) throw bad('Conecta tu wallet para canjear');
      const shards = Math.floor(Number(body.shards));
      if (!Number.isFinite(shards) || shards < cfg.minClaimShards) throw bad(`Mínimo ${cfg.minClaimShards} Shards por canje`);
      if (shards > p.shards) throw bad('No tienes tantos Shards');
      const amount = BigInt(shards) * riftPerShardWei;
      const remainingPlayer = await chain.vault.remainingForPlayerToday(p.wallet);
      const pendingPlayer = pendingClaimsWei((c) => c.playerId === p.id);
      const pendingAll = pendingClaimsWei(() => true);
      const remainingGlobal = await chain.vault.remainingToday();
      const available = [remainingPlayer - pendingPlayer, remainingGlobal - pendingAll].reduce((a, b) => (a < b ? a : b));
      if (available < amount) {
        const maxShards = available > 0n ? available / riftPerShardWei : 0n;
        throw bad(`Límite diario alcanzado. Hoy puedes canjear como máximo ${maxShards} Shards`);
      }
      const claimId = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const signature = await chain.signClaim(p.wallet, amount, claimId, deadline);
      p.shards -= shards;
      const claim = {
        id: claimId.toString(),
        playerId: p.id,
        wallet: p.wallet,
        shards,
        amountWei: amount.toString(),
        deadline,
        signature,
        status: 'pending',
        createdAt: Date.now()
      };
      D.claims[claim.id] = claim;
      db.save();
      return { claim, vault: chain.deployment.contracts.RewardVault, profile: profileView(p) };
    },

    'GET /api/economy': async () => {
      const out = {
        players: Object.keys(D.players).length,
        stats: D.stats,
        riftPerShard: cfg.riftPerShard,
        vault: null,
        catalog: null
      };
      if (chain) {
        try {
          const v = await chain.vaultStats();
          out.vault = {
            day: v.day,
            remainingToday: formatEther(v.remaining),
            dailyBudget: formatEther(v.budget),
            maxPerPlayer: formatEther(v.maxPerPlayer),
            balance: formatEther(v.balance)
          };
          out.catalog = await chain.catalog();
        } catch (err) {
          out.error = err.message;
        }
      }
      return out;
    },

    'GET /api/arena': async () => {
      const list = Object.values(D.tournaments)
        .sort((a, b) => b.endsAt - a.endsAt)
        .slice(0, 5);
      const out = [];
      for (const t of list) {
        let onchain = null;
        if (chain) {
          try {
            const [info, payout] = await chain.arena.getTournament(BigInt(t.id));
            onchain = {
              entryFee: formatEther(info.entryFee),
              pool: formatEther(info.fees + info.sponsored),
              entrants: Number(info.entrants),
              rakeBps: Number(info.rakeBps),
              burnBps: Number(info.burnBps),
              status: Number(info.status),
              payoutBps: payout.map(Number)
            };
          } catch {
            onchain = null;
          }
        }
        out.push({
          id: t.id,
          endsAt: t.endsAt,
          settled: !!t.settled,
          onchain,
          ranking: Object.values(t.scores)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map((e) => ({ ...e, wallet: shortAddr(e.wallet) }))
        });
      }
      return { tournaments: out };
    },

    'GET /api/arena/status': async ({ req }) => {
      const p = auth(req);
      const t = activeTournament();
      if (!t || !p.wallet || !chain) return { tournament: t?.id ?? null, entered: false };
      return { tournament: t.id, entered: await chain.arena.entered(BigInt(t.id), p.wallet) };
    },

    'POST /api/admin/arena/create': async ({ req, body }) => {
      requireAdmin(req);
      return { tournament: await createTournament(body) };
    },

    'POST /api/admin/arena/settle': async ({ req, body }) => {
      requireAdmin(req);
      return await settleTournament(String(body.id));
    }
  };

  function requireAdmin(req) {
    if (!cfg.adminToken || req.headers['x-admin-token'] !== cfg.adminToken) throw new HttpError(403, 'Solo admin');
  }

  async function createTournament(body = {}) {
    if (!chain) throw bad('Arena requiere blockchain');
    const fee = BigInt(Math.round(Number(body.entryFee ?? cfg.arenaFee) * 1e6)) * 10n ** 12n;
    const hours = Number(body.hours ?? cfg.arenaHours);
    const endsAt = Math.floor((await chainNow()) + hours * 3600);
    const payout = body.payoutBps ?? ARENA_PAYOUT;
    const tx = await chain.arena.create(fee, endsAt, body.rakeBps ?? 1000, body.burnBps ?? 500, payout);
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return chain.arena.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === 'TournamentCreated');
    const id = ev.args.id.toString();
    D.tournaments[id] = { id, endsAt, slots: payout.length, scores: {}, settled: false, createdAt: Date.now() };
    db.save();
    return D.tournaments[id];
  }

  async function settleTournament(id) {
    const t = D.tournaments[id];
    if (!t || t.settled) throw bad('Torneo inexistente o ya liquidado');
    if (t.endsAt > (await chainNow())) throw bad('El torneo no terminó');
    const winners = Object.values(t.scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, t.slots)
      .map((e) => e.wallet);
    const tx = await chain.arena.settle(BigInt(id), winners);
    await tx.wait();
    t.settled = true;
    t.winners = winners;
    db.save();
    return { id, winners, tx: tx.hash };
  }

  /** Hora de la cadena (los bloques pueden ir unos segundos por delante del reloj local). */
  async function chainNow() {
    const block = await chain.provider.getBlock('latest');
    return Math.max(Math.floor(Date.now() / 1000), block?.timestamp ?? 0);
  }

  async function arenaTick() {
    if (!chain || !cfg.arenaAuto) return;
    try {
      const now = await chainNow();
      for (const t of Object.values(D.tournaments)) {
        if (!t.settled && t.endsAt <= now) await settleTournament(t.id);
      }
      if (!activeTournament()) await createTournament({});
    } catch (err) {
      console.warn(`Arena automática: ${err.message}`);
    }
  }

  /** Mantiene acotado el archivo de datos: replays de las últimas 5.000 partidas, registros de las últimas 20.000. */
  function pruneReplays() {
    const all = Object.values(D.runs);
    if (all.length > 20_000) {
      all.sort((a, b) => a.startedAt - b.startedAt);
      for (const r of all.slice(0, all.length - 20_000)) delete D.runs[r.id];
    }
    const verified = Object.values(D.runs).filter((r) => r.inputs);
    if (verified.length <= 5000) return;
    verified.sort((a, b) => a.finishedAt - b.finishedAt);
    for (const r of verified.slice(0, verified.length - 5000)) {
      delete r.inputs;
      delete r.choices;
    }
  }

  // --------------------------------------------------------------- HTTP

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 2_000_000) throw new HttpError(413, 'Cuerpo demasiado grande');
      chunks.push(c);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw bad('JSON inválido');
    }
  }

  function serveStatic(req, res, url) {
    if (!fs.existsSync(cfg.staticDir)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Cliente no compilado. Ejecuta `npm run build` o usa `npm run dev`.');
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    let file = path.normalize(path.join(cfg.staticDir, rel));
    if (!file.startsWith(cfg.staticDir)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(cfg.staticDir, 'index.html');
    const ext = path.extname(file);
    const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
    if (rel.startsWith('/assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress ?? '?';
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    const handler = routes[`${req.method} ${url.pathname}`];
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    try {
      if (!handler) throw new HttpError(404, 'Ruta inexistente');
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await handler({ req, url, body, ip });
      res.writeHead(200);
      res.end(JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
    } catch (err) {
      const status = err.status ?? 500;
      if (status === 500) console.error(err);
      res.writeHead(status);
      res.end(JSON.stringify({ error: status === 500 ? 'Error interno' : err.message }));
    }
  });

  let arenaTimer = null;

  return {
    cfg,
    db,
    chain,
    server,
    listen(port = cfg.port, host = cfg.host) {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          if (cfg.arenaAuto) {
            arenaTick();
            arenaTimer = setInterval(arenaTick, 5 * 60_000);
          }
          resolve(server.address());
        });
      });
    },
    async close() {
      if (arenaTimer) clearInterval(arenaTimer);
      await new Promise((r) => server.close(r));
      pool.close();
      db.flush();
    }
  };
}
