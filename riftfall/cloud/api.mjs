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
import { orderUsd } from '../src/shared/purchase-order.js';
import { fiatConfig, fiatKey, fiatSellable, fiatCode, parseFiatCode, parseFiatRef, fiatReviewMessage, FIAT_ORDER_TTL, FIAT_REVIEW_WINDOW } from '../src/shared/fiat.js';

const DAY = 86_400_000;
const SESSION_DAYS = 365;
const GAMES = ['riftfall', 'cargo'];
const MAX_SAVE = 400_000;
const MAX_BODY = 1_500_000;
/** Códigos para llevar la cuenta a otro navegador: de un solo uso y de vida corta. */
const HANDOFF_TTL = 5 * 60_000;
const HANDOFF_PURPOSES = ['open', 'move'];

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

/** Red de la que vino alguien, a partir de `?ref=` / `utm_source` o de la página que lo trajo. */
export function sourceOf(ref) {
  const r = String(ref ?? '').trim().toLowerCase().replace(/^www\./, '').slice(0, 60);
  if (!r) return null;
  const known = [['tiktok', /tiktok|^tt$/], ['instagram', /instagram|^ig$/], ['facebook', /facebook|fb\.|^fb$/], ['x', /^t\.co$|twitter|^x\.com$|^x$/],
    ['youtube', /youtube|youtu\.be|^yt$/], ['whatsapp', /whatsapp|^wa$/], ['telegram', /telegram|^t\.me$|^tg$/], ['reddit', /reddit/],
    ['google', /google/], ['itch', /itch\.io|^itch$/], ['crazygames', /crazygames/], ['discord', /discord/]];
  for (const [name, re] of known) if (re.test(r)) return name;
  return r.replace(/[^a-z0-9._-]/g, '').slice(0, 40) || null;
}

/** Dispositivo según el navegador: celular, compu o robot (vistas previas de links, buscadores). */
export function deviceKind(ua = '') {
  if (/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|discord|embedly/i.test(ua)) return 'bot';
  return /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
}

/**
 * Fecha de corte de las sesiones (variable SESSIONS_NOT_BEFORE: milisegundos o una fecha ISO). Sirve
 * para dar de baja las sesiones emitidas cuando todavía viajaban en los links. Sin la variable, no se
 * revoca nada.
 */
export function sessionCutoff(env = {}) {
  const raw = String(env.SESSIONS_NOT_BEFORE ?? '').trim();
  if (!raw) return 0;
  const n = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
    // Revocación: las sesiones de antes de la fecha de corte dejan de valer para las cuentas que pueden
    // volver a entrar (con wallet o huella). Los invitados no tienen otra forma de entrar: conservan la suya.
    const cutoff = sessionCutoff(ctx.env);
    if (cutoff && s.created_at < cutoff && (await ctx.store.hasCredentials(s.player_id))) {
      await ctx.store.dropSession(hash);
      return null;
    }
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

  /**
   * Guarda de dónde llegó un jugador nuevo: la red (link con ?ref= o la página que lo trajo), el país
   * (lo dice Vercel o Cloudflare según por dónde entró), la zona horaria, el idioma, el dispositivo y
   * el juego. No guarda la IP. Si algo falla, la cuenta se crea igual.
   */
  async function recordOrigin(ctx, playerId, o = {}) {
    try {
      const h = ctx.request.headers;
      const clip = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
      // Entrando por Vercel (el link de siempre), el país de Cloudflare sería el del servidor de Vercel.
      const viaVercel = h.has('x-vercel-id') || h.has('x-vercel-ip-country');
      const country = clip(h.get('x-vercel-ip-country'), 2) ?? (viaVercel ? null : clip(ctx.request.cf?.country, 2));
      await ctx.store.addOrigin({
        playerId,
        src: sourceOf(o?.ref),
        country: country?.toUpperCase() ?? null,
        tz: clip(o?.tz, 40),
        lang: clip(o?.lang, 12),
        device: deviceKind(h.get('user-agent') ?? ''),
        game: GAMES.includes(o?.game) ? o.game : null,
        now: ctx.t
      });
    } catch (err) {
      console.error('origin', err);
    }
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
      await recordOrigin(ctx, player.id, body.origin);
      return json({ ok: true, token, account: await account(ctx, player) });
    },

    // ---------- Estadísticas (solo el dueño) ----------
    'GET /api/rift/stats': async (ctx) => {
      const s = await needSession(ctx);
      const admins = adminWallets(ctx.env);
      if (!(await ctx.store.wallets(s.player.id)).some((w) => admins.has(w))) throw new HttpError(404, 'not-found');
      const offset = Math.max(-14, Math.min(14, Number(ctx.url.searchParams.get('tz')) || 0)) * 3600;
      return json({ ok: true, stats: await ctx.store.stats(ctx.t, offset) });
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

    // ---------- Llevar la cuenta a otro navegador (MetaMask, mudanza) con un código de un solo uso ----------
    'POST /api/rift/handoff': async (ctx) => {
      const s = await needSession(ctx);
      const { purpose, origin } = await readJson(ctx.request, 2000);
      if (!HANDOFF_PURPOSES.includes(purpose)) throw new HttpError(400, 'purpose');
      const target = siteOf(ctx, origin).origin;
      if (origin && target !== origin) throw new HttpError(400, 'origin');
      const kind = `handoff:${purpose}`;
      // Un solo código vivo por jugador y por uso: pedir otro anula el anterior.
      const code = b64url(randomBytes(32));
      // Se guarda el resumen del código (no el código) y el sitio donde se va a usar.
      await ctx.store.replaceChallenge({
        id: await sha256hex(code),
        kind,
        value: JSON.stringify({ o: target }),
        playerId: s.player.id,
        expires: ctx.t + HANDOFF_TTL
      });
      return json({ ok: true, code, expires: ctx.t + HANDOFF_TTL });
    },

    'POST /api/rift/handoff/redeem': async (ctx) => {
      const { code, purpose, origin } = await readJson(ctx.request, 2000);
      if (!HANDOFF_PURPOSES.includes(purpose) || typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw new HttpError(400, 'expired');
      const ch = await ctx.store.takeChallenge(await sha256hex(code), `handoff:${purpose}`, ctx.t);
      if (!ch?.player_id) throw new HttpError(400, 'expired');
      // El código solo vale en el sitio para el que se pidió.
      if (origin !== siteOf(ctx, origin).origin || JSON.parse(ch.value).o !== origin) throw new HttpError(400, 'expired');
      if (!(await ctx.store.player(ch.player_id))) throw new HttpError(400, 'expired');
      return json(await switchTo(ctx, await sessionOf(ctx), ch.player_id));
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
    'POST /api/rift/purchase/order': async (ctx) => {
      const s = await needSession(ctx);
      const { kind, item, method, payer: rawPayer } = await readJson(ctx.request, 2000);
      const payer = String(rawPayer ?? '').toLowerCase();
      if (orderUsd(kind, item) == null || !['bnb', 'usdt'].includes(method)) throw new HttpError(400, 'badOrder');
      if (!/^0x[0-9a-f]{40}$/.test(payer) || !(await ctx.store.wallets(s.player.id)).includes(payer)) throw new HttpError(403, 'linkWallet');
      if (!(await ctx.store.canOrder(s.player.id, payer, ctx.t))) throw new HttpError(429, 'tooManyOrders');
      let order;
      try { order = await chain.quote({ id: randomHex(16), kind, item, method, payer, now: ctx.t }); }
      catch { throw new HttpError(503, 'priceUnavailable'); }
      try { await ctx.store.addOrder(s.player.id, order); }
      catch (err) {
        if (!(err instanceof Conflict)) throw err;
        throw new HttpError(429, 'tooManyOrders');
      }
      return json({ ok: true, order });
    },
    'POST /api/rift/purchase/review/options': async (ctx) => {
      const s = await needSession(ctx);
      const admins = adminWallets(ctx.env);
      if (!(await ctx.store.wallets(s.player.id)).some((w) => admins.has(w))) throw new HttpError(404, 'not-found');
      const body = await readJson(ctx.request, 2000);
      const tx = String(body.tx ?? '').toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(tx) || orderUsd(body.kind, body.item) == null) throw new HttpError(400, 'badOrder');
      const prev = await ctx.store.purchase(tx);
      if (prev) throw new HttpError(409, 'claimed');
      const pay = await chain.payment(tx, { review: true, findOrder: (id) => ctx.store.order(id) });
      if (pay.kind !== 'manual') throw new HttpError(400, pay.reason ?? 'badOrder');
      const playerId = await ctx.store.walletOwner(pay.payer);
      if (!playerId) throw new HttpError(400, 'linkWallet');
      if (pay.tagItem ? body.kind !== 'style' || body.item !== pay.tagItem : body.kind !== 'founder') throw new HttpError(400, 'otherItem');
      if (pay.lockedItem && (body.kind !== pay.lockedKind || body.item !== pay.lockedItem)) throw new HttpError(400, 'otherItem');
      if (body.amountWei !== pay.amountWei) throw new HttpError(400, 'badOrder');
      const reason = String(body.reason ?? '').trim();
      if (reason.length < 10 || reason.length > 300) throw new HttpError(400, 'badOrder');
      const id = randomHex(16);
      const purchase = { tx, adminId: s.player.id, playerId, kind: body.kind, item: body.item,
        amountWei: pay.amountWei, reason, payer: pay.payer, orderId: pay.orderId, method: `${pay.method ?? 'bnb'}-manual`, now: ctx.t };
      const message = ['Rift: reconocer una compra anterior', `Sitio: ${ctx.url.host}`, `Transacción: ${tx}`,
        `Artículo: ${body.kind}/${body.item}`, `Pagador: ${pay.payer}`, `${(pay.method ?? 'bnb').toUpperCase()} recibido (unidades mínimas): ${pay.amountWei}`,
        `Motivo: ${reason}`, `Código: ${id}`, '', 'Solo registra un derecho en el juego. No mueve fondos.'].join('\n');
      await ctx.store.addChallenge({ id, kind: 'purchase-review', playerId: s.player.id,
        value: JSON.stringify({ purchase, message }), expires: ctx.t + 2 * 60_000 });
      return json({ ok: true, id, message });
    },
    'POST /api/rift/purchase/review': async (ctx) => {
      const s = await needSession(ctx);
      const { id, signature } = await readJson(ctx.request, 4000);
      const ch = await ctx.store.takeChallenge(String(id ?? ''), 'purchase-review', ctx.t);
      if (!ch || ch.player_id !== s.player.id) throw new HttpError(400, 'expired');
      const { purchase, message } = JSON.parse(ch.value);
      let signer;
      try { signer = verifyMessage(message, String(signature ?? '')).toLowerCase(); }
      catch { throw new HttpError(401, 'signature'); }
      if (!adminWallets(ctx.env).has(signer) || !(await ctx.store.wallets(s.player.id)).includes(signer)) throw new HttpError(403, 'signature');
      if (await ctx.store.purchase(purchase.tx)) throw new HttpError(409, 'claimed');
      // Confirmar nuevamente el bloque tras la firma, para no reconocer un pago reorganizado.
      const pay = await chain.payment(purchase.tx, { review: true, findOrder: (id) => ctx.store.order(id) });
      if (pay.kind !== 'manual' || pay.payer !== purchase.payer || pay.amountWei !== purchase.amountWei) throw new HttpError(400, pay.reason ?? 'badOrder');
      await ctx.store.reviewPurchase({ ...purchase, now: ctx.t });
      return json({ ok: true });
    },
    'POST /api/rift/purchase': async (ctx) => {
      const s = await needSession(ctx);
      const tx = String((await readJson(ctx.request, 2000)).tx ?? '').toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(tx)) throw new HttpError(400, 'badHash');
      const prev = await ctx.store.purchase(tx);
      if (prev) {
        if (prev.player_id !== s.player.id) throw new HttpError(409, 'claimed');
        return json({ ok: true, account: await account(ctx, s.player) });
      }
      const pay = await chain.payment(tx, { findOrder: (id) => ctx.store.order(id) });
      if (!pay.kind) throw new HttpError(400, pay.reason ?? 'notFound');
      // Solo el dueño de la wallet que pagó puede sumar la compra a su cuenta.
      const wallets = await ctx.store.wallets(s.player.id);
      if (!wallets.includes(pay.payer)) throw new HttpError(403, 'linkWallet', { payer: pay.payer });
      const purchase = { tx, playerId: s.player.id, kind: pay.kind, item: pay.item, usd: pay.usd, method: pay.method, payer: pay.payer, now: ctx.t };
      try {
        if (pay.orderId) await ctx.store.completeOrder(pay.orderId, purchase);
        else await ctx.store.addPurchase(purchase);
      } catch (err) {
        const saved = await ctx.store.purchase(tx);
        if (saved?.player_id === s.player.id) return json({ ok: true, account: await account(ctx, s.player) });
        if (saved || err instanceof Conflict) throw new HttpError(409, 'claimed');
        throw err;
      }
      return json({ ok: true, account: await account(ctx, s.player) });
    },

    // ---------- Pago en pesos: pedido del jugador y reconocimiento firmado del dueño ----------
    // Sin caché: si el dueño apaga el cobro o cambia el destino, el botón tiene que reflejarlo enseguida.
    'GET /api/rift/fiat': async (ctx) => json({ ok: true, ...fiatConfig(ctx.env) }),

    'POST /api/rift/fiat/order': async (ctx) => {
      const s = await needSession(ctx);
      const cfg = fiatConfig(ctx.env);
      if (!cfg.enabled) throw new HttpError(404, 'not-found');
      const { kind, item } = await readJson(ctx.request, 2000);
      const ars = fiatSellable(kind, item) ? cfg.prices[fiatKey(kind, item)] : undefined;
      if (!ars) throw new HttpError(400, 'badOrder');
      // La compra queda en la cuenta: tiene que poder volver a entrar (huella o wallet) antes de pagar.
      if (!(await ctx.store.hasCredentials(s.player.id))) throw new HttpError(403, 'protect');
      if (await ctx.store.hasPurchase(s.player.id, kind, item)) throw new HttpError(409, 'owned');
      // Si ya hay un pedido abierto de este artículo (aunque haya vencido), es ese: puede estar pagado y
      // esperando al dueño. No se arma otro para que nadie pague dos veces.
      const open = await ctx.store.openFiatOrder(s.player.id, kind, item, ctx.t);
      if (open) return json({ ok: true, existing: true, order: fiatOrderView(open, ctx.t) });
      // El destino del cobro queda fijado en el pedido, igual que el importe y el artículo.
      const order = {
        id: randomHex(16), code: fiatCode(randomBytes(10)), playerId: s.player.id, kind, item, ars, now: ctx.t, expires: ctx.t + FIAT_ORDER_TTL,
        payUrl: cfg.payUrl ?? null, alias: cfg.alias ?? null, holder: cfg.holder ?? null
      };
      try {
        await ctx.store.addFiatOrder(order);
      } catch (err) {
        if (!(err instanceof Conflict)) throw err;
        // Dos pedidos a la vez del mismo artículo: queda el que entró primero.
        const first = await ctx.store.openFiatOrder(s.player.id, kind, item, ctx.t);
        if (first) return json({ ok: true, existing: true, order: fiatOrderView(first, ctx.t) });
        throw new HttpError(429, 'tooManyOrders');
      }
      return json({ ok: true, order: fiatOrderView(await ctx.store.fiatOrder(order.id), ctx.t) });
    },

    'GET /api/rift/fiat/orders': async (ctx) => {
      const s = await needSession(ctx);
      return json({ ok: true, orders: (await ctx.store.fiatOrders(s.player.id)).map((o) => fiatOrderView(o, ctx.t)) });
    },

    'POST /api/rift/fiat/cancel': async (ctx) => {
      const s = await needSession(ctx);
      const id = String((await readJson(ctx.request, 2000)).id ?? '');
      if (!/^[0-9a-f]{32}$/.test(id) || !(await ctx.store.cancelFiatOrder(id, s.player.id))) throw new HttpError(400, 'badOrder');
      return json({ ok: true });
    },

    'GET /api/rift/fiat/pending': async (ctx) => {
      await needAdmin(ctx);
      return json({ ok: true, orders: (await ctx.store.pendingFiatOrders(ctx.t)).map((o) => fiatOrderView(o, ctx.t)) });
    },

    'POST /api/rift/fiat/review/options': async (ctx) => {
      const s = await needAdmin(ctx);
      const body = await readJson(ctx.request, 2000);
      const code = parseFiatCode(body.code);
      const ref = parseFiatRef(body.ref);
      const reason = String(body.reason ?? '').trim();
      if (!code || !ref || reason.length < 10 || reason.length > 300) throw new HttpError(400, 'badOrder');
      const order = await ctx.store.fiatOrderByCode(code);
      if (!order || order.created_at <= ctx.t - FIAT_REVIEW_WINDOW) throw new HttpError(404, 'noOrder');
      if (order.status !== 'pending') throw new HttpError(409, order.status === 'paid' ? 'claimed' : 'cancelled');
      // El dueño carga lo que cobró: tiene que ser el importe del pedido, ni más ni menos.
      if (body.ars !== order.ars) throw new HttpError(400, 'amount');
      if (await ctx.store.fiatRefUsed(ref)) throw new HttpError(409, 'refUsed');
      const id = randomHex(16);
      const message = fiatReviewMessage({ host: ctx.url.host, order, ref, reason, nonce: id });
      await ctx.store.addChallenge({ id, kind: 'fiat-review', playerId: s.player.id, value: JSON.stringify({ orderId: order.id, ref, reason, message }), expires: ctx.t + 2 * 60_000 });
      return json({ ok: true, id, message, order: fiatOrderView(order, ctx.t) });
    },

    'POST /api/rift/fiat/review': async (ctx) => {
      const s = await needAdmin(ctx);
      const { id, signature } = await readJson(ctx.request, 4000);
      const ch = await ctx.store.takeChallenge(String(id ?? ''), 'fiat-review', ctx.t);
      if (!ch || ch.player_id !== s.player.id) throw new HttpError(400, 'expired');
      const { orderId, ref, reason, message } = JSON.parse(ch.value);
      let signer;
      try {
        signer = verifyMessage(message, String(signature ?? '')).toLowerCase();
      } catch {
        throw new HttpError(401, 'signature');
      }
      // Firma la wallet del dueño, y esa wallet tiene que estar en la cuenta que está reconociendo.
      if (!adminWallets(ctx.env).has(signer) || !(await ctx.store.wallets(s.player.id)).includes(signer)) throw new HttpError(403, 'signature');
      try {
        await ctx.store.payFiatOrder({ orderId, ref, adminId: s.player.id, signer, reason, now: ctx.t });
      } catch (err) {
        if (!(err instanceof Conflict)) throw err;
        throw new HttpError(409, 'claimed');
      }
      return json({ ok: true });
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
    /** Antes de revocar: cuántas sesiones abiertas hay de antes de una fecha y cuántas se darían de baja. */
    'GET /api/rift/audit/sessions': async (ctx) => {
      audit(ctx);
      const cutoff = sessionCutoff({ SESSIONS_NOT_BEFORE: ctx.url.searchParams.get('before') });
      if (!cutoff) throw new HttpError(400, 'before');
      const r = await ctx.store.sessionsBefore(cutoff, ctx.t);
      const total = r?.total ?? 0;
      const revoked = r?.withCredentials ?? 0;
      return json({ ok: true, before: cutoff, active: sessionCutoff(ctx.env), total, revoked, kept: total - revoked });
    },
    'POST /api/rift/audit': async (ctx) => {
      audit(ctx);
      const { id, ok, board, pid, claimed } = await readJson(ctx.request, 4000);
      await ctx.store.setRunStatus(Number(id), ok ? 'ok' : 'bad');
      if (!ok) await removeEntry(ctx, board, pid, claimed);
      return json({ ok: true });
    }
  };

  /** Sesión de una cuenta del dueño (tiene la wallet que cobra). Para los demás, la ruta no existe. */
  async function needAdmin(ctx) {
    const s = await needSession(ctx);
    const admins = adminWallets(ctx.env);
    if (!(await ctx.store.wallets(s.player.id)).some((w) => admins.has(w))) throw new HttpError(404, 'not-found');
    return s;
  }

  /** Lo que se muestra de un pedido en pesos (nunca a quién pertenece). */
  function fiatOrderView(o, now) {
    return {
      id: o.id, code: o.code, kind: o.kind, item: o.item, ars: o.ars,
      status: o.status ?? 'pending', createdAt: o.created_at, expiresAt: o.expires_at,
      expired: (o.status ?? 'pending') === 'pending' && o.expires_at <= now,
      // A dónde había que pagar cuando se hizo el pedido (no cambia aunque después cambie la configuración).
      target: o.pay_url ? { payUrl: o.pay_url } : { alias: o.pay_alias ?? null, holder: o.pay_holder ?? null },
      ...(o.paid_at ? { paidAt: o.paid_at } : {})
    };
  }

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
