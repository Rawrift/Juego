// Servidor de la Cuenta Rift: una sola cuenta para RIFTFALL y Rift Cargo. Se entra como invitado
// (al instante), con la wallet (firmando un mensaje, gratis) o con huella / Face ID (passkey), y
// guarda en la nube el progreso de los dos juegos, el nombre, las compras y los rankings.
//
// Es una función `handle(request, env)` con la interfaz estándar de fetch: corre en Cloudflare
// Pages (functions/api/[[path]].js, con D1 en env.DB) y en el servidor Node de las pruebas.

import { verifyMessage } from 'ethers';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { createStore, ensureSchema, Conflict } from './store.mjs';
import { createChain } from './chain.mjs';
import { quickVerify } from './quick-verify.mjs';
import { createRunBoard } from '../server/run-board.mjs';
import { createDailyBoard, defaultName } from '../server/world-board.mjs';
import { replayRun } from '../src/sim/index.js';
import { cleanName } from '../src/shared/duel.js';
import { publicId } from '../src/shared/public-id.js';
import { FOUNDER } from '../src/shared/founder.js';

const DAY = 86_400_000;
const SESSION_DAYS = 365;
const GAMES = ['riftfall', 'cargo'];
const MAX_SAVE = 400_000;
const MAX_BODY = 1_500_000;

// ---------- Utilidades ----------

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const randomHex = (n) => Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('');
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readJson(request, max = MAX_BODY) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'too-big');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'json');
  }
}

/** Dispositivo legible para la lista de passkeys ("iPhone", "Android", "Windows"…). */
function deviceName(ua = '') {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Dispositivo';
}

/**
 * Direcciones desde las que se juega. El juego se ve en riftfall.duckdns.org (que pasa por Vercel y
 * reenvía todo acá) y en riftgames.pages.dev: el servidor recibe el pedido con la dirección de
 * Cloudflare, así que el juego dice desde dónde lo abrieron y solo se acepta si está en esta lista.
 * Las passkeys quedan atadas a esa dirección.
 */
export const SITES = ['https://riftfall.duckdns.org', 'https://riftgames.pages.dev'];

function siteOf(ctx, claimed) {
  const own = ctx.url.origin;
  const extra = String(ctx.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = new Set([own, ...SITES, ...extra]);
  const origin = typeof claimed === 'string' && allowed.has(claimed) ? claimed : own;
  const u = new URL(origin);
  return { origin, host: u.host, hostname: u.hostname };
}

/**
 * Dueños del juego: la wallet que cobra las ventas (la del creador) y las que se sumen en la variable
 * ADMIN_WALLETS (separadas por coma). Quien tenga una de esas wallets en su cuenta tiene todo
 * desbloqueado y el Panel del dueño en los dos juegos.
 */
export function adminWallets(env = {}) {
  const extra = String(env.ADMIN_WALLETS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s));
  return new Set([FOUNDER.treasury.toLowerCase(), ...extra]);
}

/**
 * Mensaje que firma la wallet para entrar (no cuesta nada ni autoriza pagos). Sin `address` (desde
 * Chrome o Safari en el celular se conecta y se firma en un solo paso, antes de saber la wallet) no
 * lleva esa línea: la wallet sale de la firma.
 */
export function walletMessage(address, code, host, at) {
  return [
    'Rift: iniciar sesión',
    `Sitio: ${host}`,
    ...(address ? [`Wallet: ${address}`] : []),
    `Código: ${code}`,
    `Fecha: ${new Date(at).toISOString()}`,
    '',
    'Esta firma solo prueba que la wallet es tuya: no cuesta nada ni autoriza pagos.'
  ].join('\n');
}

// ---------- Servidor ----------

export function createApi({ now = () => Date.now(), chain = createChain() } = {}) {
  async function handle(request, env = {}) {
    const url = new URL(request.url);
    try {
      if (!env.DB) throw new HttpError(503, 'no-db');
      await ensureSchema(env.DB);
      const store = createStore(env.DB);
      const ctx = { request, env, url, store, t: now() };
      if (Math.random() < 0.02) await store.sweep(ctx.t);
      const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
      const fn = ROUTES[route];
      if (!fn) throw new HttpError(404, 'not-found');
      return await fn(ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ ok: false, error: err.code, ...err.extra }, err.status);
      console.error(err);
      return json({ ok: false, error: 'internal' }, 500);
    }
  }

  // ---------- Sesión ----------

  async function sessionOf(ctx) {
    const auth = ctx.request.headers.get('authorization') ?? '';
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(auth);
    if (!m) return null;
    const hash = await sha256hex(m[1]);
    const s = await ctx.store.session(hash, ctx.t);
    if (!s) return null;
    const player = await ctx.store.player(s.player_id);
    return player ? { hash, player } : null;
  }
  async function needSession(ctx) {
    const s = await sessionOf(ctx);
    if (!s) throw new HttpError(401, 'session');
    return s;
  }
  async function newSession(ctx, playerId) {
    const token = b64url(randomBytes(32));
    await ctx.store.addSession(await sha256hex(token), playerId, ctx.t, ctx.t + SESSION_DAYS * DAY);
    await ctx.store.touch(playerId, ctx.t);
    return token;
  }

  /** Lo que el juego necesita saber de la cuenta. */
  async function account(ctx, player) {
    const [wallets, passkeys, purchases] = await Promise.all([
      ctx.store.wallets(player.id),
      ctx.store.passkeys(player.id),
      ctx.store.purchases(player.id)
    ]);
    const admins = adminWallets(ctx.env);
    return {
      player: {
        id: player.id,
        pid: player.pid,
        name: player.name,
        guest: !wallets.length && !passkeys.length,
        ...(wallets.some((w) => admins.has(w)) ? { admin: true } : {})
      },
      wallets,
      passkeys: passkeys.map((p) => ({ id: p.cred_id.slice(0, 10), device: p.device, created: p.created_at })),
      purchases
    };
  }

  /**
   * Pasa la sesión a otra cuenta (entrar con wallet o huella desde otro dispositivo). Si la cuenta
   * de antes era un invitado sin credenciales, sus compras pasan a la nueva y el juego mezcla el
   * progreso local; si tenía credenciales, el juego reemplaza el progreso local por el de la cuenta.
   */
  async function switchTo(ctx, current, targetId) {
    const prevGuest = current ? !(await ctx.store.hasCredentials(current.player.id)) : true;
    if (current && current.player.id !== targetId) {
      if (prevGuest) await ctx.store.movePurchases(current.player.id, targetId);
      await ctx.store.dropSession(current.hash);
    }
    const token = await newSession(ctx, targetId);
    const player = await ctx.store.player(targetId);
    return { ok: true, token, switched: current?.player.id !== targetId, prevGuest, account: await account(ctx, player) };
  }

  async function createPlayer(ctx, { pid = null, name = '' } = {}) {
    let usePid = /^[a-f0-9]{32}$/.test(pid ?? '') && !(await ctx.store.playerByPid(pid)) ? pid : randomHex(16);
    return ctx.store.createPlayer({ id: randomHex(16), pid: usePid, name: cleanName(name), now: ctx.t });
  }

  // ---------- Rankings ----------

  async function boardFor(ctx, key, make) {
    // Cada pedido arma su tablero: lee la versión, y si otro escribió antes, se reintenta.
    let v = 0;
    return make({
      load: async () => {
        const d = await ctx.store.doc(key);
        v = d.v;
        return d.data;
      },
      save: (data) => ctx.store.putDoc(key, data, v),
      now: () => ctx.t
    });
  }

  function verifier(ctx, board) {
    if (ctx.env.FULL_VERIFY === '1') return replayRun;
    return (run) => {
      const res = quickVerify(run);
      if (res.ok) ctx.pendingRun = { board, claimed: res.summary };
      return res;
    };
  }

  /** Datos del jugador para el ranking: con sesión manda la cuenta; sin sesión, el id del navegador. */
  async function rankingIdentity(ctx, body) {
    const s = await sessionOf(ctx);
    if (!s) return body;
    return { ...body, pid: s.player.pid, name: s.player.name || body.name };
  }

  async function submitWithRetry(ctx, fn) {
    for (let i = 0; i < 4; i++) {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof Conflict) || i === 3) throw err;
      }
    }
  }

  async function keepRun(ctx, body, res) {
    if (!ctx.pendingRun || !res.ok) return;
    const { inputs, choices, seed, ship, shipLevel, talents, rift, parts, n } = body;
    await ctx.store.addRun({
      board: ctx.pendingRun.board,
      pid: body.pid,
      body: JSON.stringify({ inputs, choices, seed, ship, shipLevel, talents, rift, parts, n }),
      claimed: JSON.stringify(ctx.pendingRun.claimed),
      now: ctx.t
    });
  }

  const ROUTES = {
    // ---------- Cuenta ----------
    'GET /api/rift/me': async (ctx) => {
      const s = await needSession(ctx);
      await ctx.store.touch(s.player.id, ctx.t);
      return json({ ok: true, account: await account(ctx, s.player) });
    },

    'POST /api/rift/guest': async (ctx) => {
      const body = await readJson(ctx.request, 4000);
      const current = await sessionOf(ctx);
      if (current) return json({ ok: true, account: await account(ctx, current.player) });
      const player = await createPlayer(ctx, body);
      const token = await newSession(ctx, player.id);
      return json({ ok: true, token, account: await account(ctx, player) });
    },

    'POST /api/rift/name': async (ctx) => {
      const s = await needSession(ctx);
      const name = cleanName((await readJson(ctx.request, 2000)).name);
      await ctx.store.setName(s.player.id, name);
      return json({ ok: true, account: await account(ctx, { ...s.player, name }) });
    },

    'POST /api/rift/logout': async (ctx) => {
      const s = await sessionOf(ctx);
      if (s) await ctx.store.dropSession(s.hash);
      return json({ ok: true });
    },

    // ---------- Wallet: firmar un mensaje (gratis) ----------
    'POST /api/rift/wallet/nonce': async (ctx) => {
      const { address = null, origin } = await readJson(ctx.request, 2000);
      if (address !== null && !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new HttpError(400, 'address');
      const id = randomHex(16);
      const message = walletMessage(address, randomHex(8), siteOf(ctx, origin).host, ctx.t);
      await ctx.store.addChallenge({ id, kind: 'wallet', value: JSON.stringify({ address: address?.toLowerCase() ?? null, message }), expires: ctx.t + 10 * 60_000 });
      return json({ ok: true, id, message });
    },

    'POST /api/rift/wallet/login': async (ctx) => {
      const { id, signature } = await readJson(ctx.request, 4000);
      const ch = await ctx.store.takeChallenge(String(id ?? ''), 'wallet', ctx.t);
      if (!ch) throw new HttpError(400, 'expired');
      const { address: expected, message } = JSON.parse(ch.value);
      let signer = '';
      try {
        signer = verifyMessage(message, String(signature ?? '')).toLowerCase();
      } catch {
        signer = '';
      }
      // Si el pedido no decía la wallet, es la que firmó.
      if (!/^0x[0-9a-f]{40}$/.test(signer) || (expected && signer !== expected)) throw new HttpError(401, 'signature');
      const address = signer;
      const current = await sessionOf(ctx);
      const owner = await ctx.store.walletOwner(address);
      if (owner) return json(await switchTo(ctx, current, owner));
      // Wallet nueva: se suma a la cuenta actual (o crea una si no hay sesión).
      const player = current?.player ?? (await createPlayer(ctx));
      await ctx.store.addWallet(address, player.id, ctx.t);
      const token = current ? null : await newSession(ctx, player.id);
      return json({ ok: true, linked: true, ...(token ? { token } : {}), account: await account(ctx, player) });
    },

    // ---------- Passkeys (huella / Face ID) ----------
    'POST /api/rift/passkey/options': async (ctx) => {
      const { mode, origin } = await readJson(ctx.request, 2000);
      const site = siteOf(ctx, origin);
      const rpID = site.hostname;
      // El desafío guarda la dirección: la verificación usa esa, no la que mande el juego después.
      const challengeValue = (c) => JSON.stringify({ c, o: site.origin });
      if (mode === 'register') {
        const s = await needSession(ctx);
        const existing = await ctx.store.passkeys(s.player.id);
        const label = s.player.name || defaultName(s.player.pid);
        const options = await generateRegistrationOptions({
          rpName: 'Rift',
          rpID,
          userID: new TextEncoder().encode(s.player.id),
          userName: label,
          userDisplayName: label,
          attestationType: 'none',
          excludeCredentials: existing.map((p) => ({ id: p.cred_id })),
          authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
        });
        const id = randomHex(16);
        await ctx.store.addChallenge({ id, kind: 'pk-reg', value: challengeValue(options.challenge), playerId: s.player.id, expires: ctx.t + 5 * 60_000 });
        return json({ ok: true, id, options });
      }
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', allowCredentials: [] });
      const id = randomHex(16);
      await ctx.store.addChallenge({ id, kind: 'pk-auth', value: challengeValue(options.challenge), expires: ctx.t + 5 * 60_000 });
      return json({ ok: true, id, options });
    },

    'POST /api/rift/passkey/register': async (ctx) => {
      const s = await needSession(ctx);
      const { id, response } = await readJson(ctx.request, 20_000);
      const ch = await ctx.store.takeChallenge(String(id ?? ''), 'pk-reg', ctx.t);
      if (!ch || ch.player_id !== s.player.id) throw new HttpError(400, 'expired');
      const { c: challenge, o: origin } = JSON.parse(ch.value);
      let v;
      try {
        v = await verifyRegistrationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: new URL(origin).hostname,
          requireUserVerification: false
        });
      } catch {
        throw new HttpError(400, 'passkey');
      }
      if (!v.verified) throw new HttpError(400, 'passkey');
      const c = v.registrationInfo.credential;
      if (await ctx.store.passkey(c.id)) throw new HttpError(409, 'passkey-exists');
      await ctx.store.addPasskey({
        credId: c.id,
        playerId: s.player.id,
        publicKey: b64url(c.publicKey),
        counter: c.counter ?? 0,
        transports: JSON.stringify(c.transports ?? []),
        device: deviceName(ctx.request.headers.get('user-agent') ?? ''),
        now: ctx.t
      });
      return json({ ok: true, account: await account(ctx, s.player) });
    },

    'POST /api/rift/passkey/login': async (ctx) => {
      const { id, response } = await readJson(ctx.request, 20_000);
      const ch = await ctx.store.takeChallenge(String(id ?? ''), 'pk-auth', ctx.t);
      if (!ch) throw new HttpError(400, 'expired');
      const row = await ctx.store.passkey(String(response?.id ?? ''));
      if (!row) throw new HttpError(404, 'passkey-unknown');
      const { c: challenge, o: origin } = JSON.parse(ch.value);
      let v;
      try {
        v = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: new URL(origin).hostname,
          credential: { id: row.cred_id, publicKey: unb64url(row.public_key), counter: row.counter, transports: JSON.parse(row.transports || '[]') },
          requireUserVerification: false
        });
      } catch {
        throw new HttpError(401, 'passkey');
      }
      if (!v.verified) throw new HttpError(401, 'passkey');
      await ctx.store.usePasskey(row.cred_id, v.authenticationInfo.newCounter ?? row.counter, ctx.t);
      return json(await switchTo(ctx, await sessionOf(ctx), row.player_id));
    },

    // ---------- Progreso de cada juego ----------
    'GET /api/rift/save': async (ctx) => {
      const s = await needSession(ctx);
      const game = ctx.url.searchParams.get('game');
      if (!GAMES.includes(game)) throw new HttpError(400, 'game');
      const row = await ctx.store.save(s.player.id, game);
      return json({ ok: true, data: row ? JSON.parse(row.data) : null, rev: row?.rev ?? 0, updatedAt: row?.updated_at ?? 0 });
    },

    'PUT /api/rift/save': async (ctx) => {
      const s = await needSession(ctx);
      const { game, data, rev } = await readJson(ctx.request, MAX_SAVE + 1000);
      if (!GAMES.includes(game)) throw new HttpError(400, 'game');
      const text = JSON.stringify(data ?? null);
      if (text.length > MAX_SAVE || !data || typeof data !== 'object') throw new HttpError(400, 'data');
      try {
        const next = await ctx.store.putSave(s.player.id, game, text, Number.isInteger(rev) ? rev : 0, ctx.t);
        return json({ ok: true, rev: next });
      } catch (err) {
        if (!(err instanceof Conflict)) throw err;
        // Otro dispositivo guardó antes: se devuelve lo de la nube para que el juego lo mezcle.
        const row = await ctx.store.save(s.player.id, game);
        throw new HttpError(409, 'conflict', { data: row ? JSON.parse(row.data) : null, rev: row?.rev ?? 0 });
      }
    },

    // ---------- Compras (Pase Fundador, estéticos): verificadas en la cadena ----------
    'POST /api/rift/purchase': async (ctx) => {
      const s = await needSession(ctx);
      const tx = String((await readJson(ctx.request, 2000)).tx ?? '').toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new HttpError(400, 'badHash');
      const prev = await ctx.store.purchase(tx);
      if (prev) {
        if (prev.player_id !== s.player.id) throw new HttpError(409, 'claimed');
        return json({ ok: true, account: await account(ctx, s.player) });
      }
      const pay = await chain.payment(tx);
      if (!pay.kind) throw new HttpError(400, pay.reason ?? 'notFound');
      // Solo el dueño de la wallet que pagó puede sumar la compra a su cuenta.
      const wallets = await ctx.store.wallets(s.player.id);
      if (!wallets.includes(pay.payer)) throw new HttpError(403, 'linkWallet', { payer: pay.payer });
      await ctx.store.addPurchase({ tx, playerId: s.player.id, kind: pay.kind, item: pay.item, usd: pay.usd, method: pay.method, payer: pay.payer, now: ctx.t });
      return json({ ok: true, account: await account(ctx, s.player) });
    },

    // ---------- Ranking de partidas normales (RIFTFALL) ----------
    'GET /api/ranking': async (ctx) => {
      const board = await boardFor(ctx, 'runs', createRunBoard);
      return json(await board.get(), 200, { 'cache-control': 'public, max-age=5' });
    },
    'POST /api/ranking': async (ctx) => {
      const body = await rankingIdentity(ctx, await readJson(ctx.request));
      const res = await submitWithRetry(ctx, async () => {
        const board = await boardFor(ctx, 'runs', (o) => createRunBoard({ ...o, verify: verifier(ctx, 'runs') }));
        return board.submit(body);
      });
      await keepRun(ctx, body, res);
      return json(res, res.ok ? 200 : 400);
    },

    // ---------- Desafío del Día (RIFTFALL) ----------
    'GET /api/daily': async (ctx) => {
      const n = Number(ctx.url.searchParams.get('n'));
      if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'day');
      const d = await ctx.store.doc(`daily:${n}`);
      return json(d.data ?? { n, entries: [], updatedAt: 0 }, 200, { 'cache-control': 'public, max-age=5' });
    },
    'POST /api/daily': async (ctx) => {
      const body = await rankingIdentity(ctx, await readJson(ctx.request));
      const n = Number(body?.n);
      const res = await submitWithRetry(ctx, async () => {
        let v = 0;
        const board = createDailyBoard({
          load: async (day) => {
            const d = await ctx.store.doc(`daily:${day}`);
            v = d.v;
            return d.data;
          },
          save: (day, data) => ctx.store.putDoc(`daily:${day}`, data, v),
          now: () => ctx.t,
          verify: verifier(ctx, `daily:${n}`)
        });
        return board.submit(body);
      });
      await keepRun(ctx, body, res);
      return json(res, res.ok ? 200 : 400);
    },

    // ---------- Auditoría de partidas (la corre un script con la clave AUDIT_TOKEN) ----------
    'GET /api/rift/audit': async (ctx) => {
      audit(ctx);
      const limit = Math.min(50, Number(ctx.url.searchParams.get('limit')) || 20);
      const runs = await ctx.store.pendingRuns(limit);
      return json({ ok: true, runs: runs.map((r) => ({ ...r, body: JSON.parse(r.body), claimed: JSON.parse(r.claimed) })) });
    },
    'POST /api/rift/audit': async (ctx) => {
      audit(ctx);
      const { id, ok, board, pid, claimed } = await readJson(ctx.request, 4000);
      await ctx.store.setRunStatus(Number(id), ok ? 'ok' : 'bad');
      if (!ok) await removeEntry(ctx, board, pid, claimed);
      return json({ ok: true });
    }
  };

  function audit(ctx) {
    const token = ctx.env.AUDIT_TOKEN;
    if (!token || ctx.request.headers.get('authorization') !== `Bearer ${token}`) throw new HttpError(404, 'not-found');
  }

  /** Saca del ranking una partida que la auditoría encontró falsa. */
  async function removeEntry(ctx, board, pid, claimed) {
    const id = publicId(pid);
    const drop = (list) => (list ?? []).filter((e) => !(e.id === id && e.score === claimed?.score));
    await submitWithRetry(ctx, async () => {
      const d = await ctx.store.doc(board);
      if (!d.data) return;
      const data = board === 'runs' ? { ...d.data, today: drop(d.data.today), all: drop(d.data.all) } : { ...d.data, entries: drop(d.data.entries) };
      await ctx.store.putDoc(board, data, d.v);
    });
  }

  return { handle };
}
