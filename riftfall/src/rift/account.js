// Cuenta Rift en el navegador: una sola cuenta para RIFTFALL y Rift Cargo (mismo sitio, misma sesión).
// Al entrar por primera vez se crea un invitado al instante y el progreso ya se guarda en la nube;
// con la wallet (firma gratis) o con huella / Face ID (passkey) se puede entrar desde otro dispositivo.
// Si no hay conexión o el sitio no tiene servidor, el juego sigue igual con lo guardado en el dispositivo.

import { injected } from '../client/injected.js';

const TOKEN = 'rift.session';
const CACHE = 'rift.account';

let current = readJson(CACHE);
let online = false;
const listeners = new Set();

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, v) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* modo privado */
  }
}
function readJson(key) {
  try {
    return JSON.parse(read(key) ?? 'null');
  } catch {
    return null;
  }
}

/** Error con un código que la interfaz traduce. */
const fail = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

let reloading = false;
/**
 * La página se va a recargar para traer otra cuenta: a partir de acá ningún guardado del juego
 * (ni local ni en la nube) debe pisar lo que viene.
 */
export function reloadForAccount(delay = 900) {
  reloading = true;
  setTimeout(() => location.reload(), delay);
}
export const isReloading = () => reloading;

export const sessionToken = () => read(TOKEN);
export const account = () => current;
export const isOnline = () => online;
/** Para sumar al pedido del ranking: así el servidor anota la partida en tu cuenta. */
export const authHeaders = () => (read(TOKEN) ? { authorization: `Bearer ${read(TOKEN)}` } : {});

export function onAccount(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setAccount(a) {
  current = a;
  write(CACHE, a ? JSON.stringify(a) : null);
  // El ranking de RIFTFALL identifica tu fila con este id: el de la cuenta manda.
  if (a?.player?.pid) write('riftfall.pid', a.player.pid);
  for (const fn of listeners) fn(a);
}

export async function api(method, path, body, { keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      keepalive,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw fail('offline');
  }
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => null) : null;
  if (!data) throw fail('offline');
  if (!res.ok || data.ok === false) throw fail(data.error ?? `http${res.status}`, { status: res.status, data });
  return data;
}

/**
 * Arranca la sesión: si no hay, crea un invitado (con el id y el nombre que ya tenía este navegador).
 * Devuelve la cuenta o null si no hay servidor.
 */
export async function start({ pid = read('riftfall.pid'), name = read('riftfall.name') } = {}) {
  try {
    if (read(TOKEN)) {
      try {
        const me = await api('GET', '/api/rift/me');
        online = true;
        setAccount(me.account);
        return current;
      } catch (err) {
        if (err.code !== 'session') throw err;
        write(TOKEN, null); // sesión vencida o borrada: se arranca un invitado nuevo
      }
    }
    const g = await api('POST', '/api/rift/guest', { pid, name });
    write(TOKEN, g.token);
    online = true;
    setAccount(g.account);
    return current;
  } catch {
    online = false;
    return null;
  }
}

/** Después de entrar a otra cuenta: si la de antes tenía credenciales, este dispositivo arranca de cero. */
const GAME_KEYS = ['riftfall.progress', 'riftfall.founder', 'riftfall.skin', 'riftfall.name', 'riftcargo.save', 'riftcargo.style'];
function afterLogin(res) {
  if (res.token) write(TOKEN, res.token);
  if (res.switched && !res.prevGuest) for (const k of GAME_KEYS) write(k, null);
  setAccount(res.account);
  return res;
}

// ---------- Wallet ----------

const eth = () => (typeof window !== 'undefined' ? injected() : null);

/** Entra (o suma la wallet a la cuenta) firmando un mensaje: gratis, sin pagar comisión. */
export async function loginWallet(provider = eth()) {
  if (!provider) throw fail('noWallet');
  let address;
  try {
    [address] = await provider.request({ method: 'eth_requestAccounts' });
  } catch (err) {
    throw fail(err?.code === 4001 ? 'rejected' : 'noWallet');
  }
  const n = await api('POST', '/api/rift/wallet/nonce', { address });
  let signature;
  try {
    signature = await provider.request({ method: 'personal_sign', params: [utf8Hex(n.message), address] });
  } catch (err) {
    throw fail(err?.code === 4001 ? 'rejected' : 'signature');
  }
  return afterLogin(await api('POST', '/api/rift/wallet/login', { id: n.id, signature }));
}

function utf8Hex(s) {
  return `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- Passkeys (huella / Face ID) ----------

export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

/** Protege la cuenta con huella o Face ID de este dispositivo. */
export async function addPasskey() {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const o = await api('POST', '/api/rift/passkey/options', { mode: 'register' });
  let response;
  try {
    response = await startRegistration({ optionsJSON: o.options });
  } catch (err) {
    throw fail(err?.name === 'InvalidStateError' ? 'passkey-exists' : 'cancelled');
  }
  const r = await api('POST', '/api/rift/passkey/register', { id: o.id, response });
  setAccount(r.account);
  return r;
}

/** Entra a la cuenta con la huella o Face ID guardada (también desde otro dispositivo). */
export async function loginPasskey() {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const o = await api('POST', '/api/rift/passkey/options', { mode: 'login' });
  let response;
  try {
    response = await startAuthentication({ optionsJSON: o.options });
  } catch {
    throw fail('cancelled');
  }
  return afterLogin(await api('POST', '/api/rift/passkey/login', { id: o.id, response }));
}

// ---------- Datos de la cuenta ----------

export async function setName(name) {
  if (!read(TOKEN)) return null;
  const r = await api('POST', '/api/rift/name', { name });
  setAccount(r.account);
  return r.account;
}

/** Cierra la sesión en este dispositivo y lo deja como nuevo (el progreso queda en la cuenta). */
export async function logout() {
  await api('POST', '/api/rift/logout').catch(() => {});
  for (const k of [TOKEN, CACHE, 'riftfall.pid', ...GAME_KEYS]) write(k, null);
  current = null;
}

/**
 * Suma a la cuenta una compra (Pase Fundador o estético) por el hash del pago. El servidor la
 * verifica en la cadena y pide que la wallet que pagó esté en la cuenta: si no está, se firma
 * para sumarla (gratis) y se reintenta.
 */
export async function claimPurchase(tx, { provider = eth(), sign = true } = {}) {
  if (!read(TOKEN)) return null;
  try {
    const r = await api('POST', '/api/rift/purchase', { tx });
    setAccount(r.account);
    return r.account;
  } catch (err) {
    if (err.code !== 'linkWallet' || !sign) throw err;
    const login = await loginWallet(provider);
    const r = await api('POST', '/api/rift/purchase', { tx });
    setAccount(r.account);
    // Esa wallet ya era de otra cuenta tuya: se entra a esa y se recarga con su progreso.
    if (login.switched) reloadForAccount();
    return r.account;
  }
}

const RANK = { pilot: 1, gold: 2, legend: 3 };
const isHash = (h) => /^0x[0-9a-fA-F]{64}$/.test(h ?? '');

/**
 * Compras de la cuenta → este dispositivo (Pase Fundador y estéticos de Rift Cargo), y las de este
 * dispositivo que falten → la cuenta (sin pedir firmas: solo si la wallet que pagó ya está en la
 * cuenta). Devuelve true si cambió algo en el dispositivo.
 */
export async function syncPurchases() {
  if (!current) return false;
  let changed = false;
  const list = current.purchases ?? [];
  const best = list.filter((p) => p.kind === 'founder' && RANK[p.item]).sort((a, b) => RANK[b.item] - RANK[a.item])[0];
  const localF = readJson('riftfall.founder');
  if (best && RANK[best.item] > (RANK[localF?.tier] ?? 0)) {
    write('riftfall.founder', JSON.stringify({ tier: best.item, tx: best.tx, payer: best.payer, method: best.method, usd: best.usd, at: best.at }));
    changed = true;
  }
  const st = readJson('riftcargo.style') ?? { bought: [], sign: '', pending: [] };
  st.bought = Array.isArray(st.bought) ? st.bought : [];
  for (const p of list.filter((x) => x.kind === 'style')) {
    if (st.bought.some((b) => String(b.tx).toLowerCase() === p.tx)) continue;
    st.bought.push({ item: p.item, tx: p.tx, payer: p.payer, usd: p.usd, method: p.method, at: p.at });
    changed = true;
  }
  if (changed) write('riftcargo.style', JSON.stringify(st));
  const known = new Set(list.map((p) => p.tx.toLowerCase()));
  const mine = [localF?.tx, ...st.bought.map((b) => b.tx)].filter((h) => isHash(h) && !known.has(h.toLowerCase()));
  for (const h of mine) await claimPurchase(h, { sign: false }).catch(() => {});
  return changed;
}

// ---------- Progreso en la nube ----------

/**
 * Sincroniza el progreso de un juego. `get()` da lo local; `merge(local, nube)` los une sin perder
 * nada; `apply(dato)` lo guarda en el dispositivo; `resolve(local, nube)` decide si otro dispositivo
 * guardó mientras se jugaba (por defecto, como `merge`). Devuelve { pull, push, schedule, flush }.
 */
export function createSync(game, { get, merge, apply, delay = 4000, resolve = merge }) {
  let rev = 0;
  let timer = null;
  let pulled = false;
  let busy = null;

  async function pull() {
    if (!read(TOKEN)) return false;
    try {
      const r = await api('GET', `/api/rift/save?game=${game}`);
      rev = r.rev;
      const local = get();
      const merged = r.data ? (local ? merge(local, r.data) : r.data) : local;
      if (merged && merged !== local) apply(merged);
      pulled = true;
      if (merged && JSON.stringify(merged) !== JSON.stringify(r.data)) await push();
      return true;
    } catch {
      return false;
    }
  }

  async function push({ keepalive = false } = {}) {
    if (!read(TOKEN) || !pulled || reloading) return false;
    const data = get();
    if (!data) return false;
    if (busy) return busy;
    busy = (async () => {
      try {
        const r = await api('PUT', '/api/rift/save', { game, data, rev }, { keepalive });
        rev = r.rev;
        return true;
      } catch (err) {
        if (err.code !== 'conflict') return false;
        // Otro dispositivo guardó antes: se mezcla (o se resuelve como diga el juego) y se vuelve a guardar.
        rev = err.data.rev;
        if (err.data.data) {
          const fixed = resolve(get(), err.data.data);
          if (fixed !== get()) apply(fixed);
        }
        try {
          rev = (await api('PUT', '/api/rift/save', { game, data: get(), rev })).rev;
          return true;
        } catch {
          return false;
        }
      } finally {
        busy = null;
      }
    })();
    return busy;
  }

  return {
    pull,
    push,
    /** Guarda en la nube a lo sumo cada `delay` ms (los cambios seguidos se juntan en un envío). */
    schedule() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        push();
      }, delay);
    },
    /** Al cerrar o esconder la página. */
    flush() {
      clearTimeout(timer);
      timer = null;
      return push({ keepalive: true });
    },
    get pulled() {
      return pulled;
    }
  };
}
