// Pasar la Cuenta Rift de un navegador a otro sin poner la sesión en el link. El navegador que tiene
// la cuenta le pide al servidor un código; el link lleva ese código, y el navegador que lo abre lo
// cambia por una sesión nueva. El código sirve una sola vez, vence a los pocos minutos y solo vale
// para el uso y el sitio para los que se pidió. Quien encuentre un link viejo no entra a nada.
//
// No depende del resto de la cuenta (ni de la wallet): lo usan RIFTFALL, Rift Cargo y la mudanza.

const TOKEN = 'rift.session';
const CACHE = 'rift.account';

/** Parámetro del link según el uso: abrir en otro navegador (MetaMask) o mudanza de dirección. */
export const HANDOFF_PARAM = { open: 'rc', move: 'mc' };
const CODE = /^[A-Za-z0-9_-]{43}$/;

/** Lo que es de una cuenta en este dispositivo: se borra al entrar a otra cuenta que ya tenía dueño. */
export const GAME_KEYS = ['riftfall.progress', 'riftfall.founder', 'riftfall.skin', 'riftfall.name', 'riftcargo.save', 'riftcargo.style'];

/** Claves que nunca viajan en un link: la sesión, la copia de la cuenta y el id secreto del ranking. */
export const PRIVATE_KEYS = [TOKEN, CACHE, 'riftfall.pid'];

const store = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const get = (s, k) => {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const set = (s, k, v) => {
  try {
    if (v == null) s?.removeItem(k);
    else s?.setItem(k, v);
  } catch {
    /* modo privado */
  }
};

async function post(path, body, token, fetchImpl) {
  const res = await fetchImpl(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
  });
  const data = await res.json().catch(() => null);
  return res.ok && data?.ok ? data : null;
}

/**
 * Pide un código para llevar la cuenta de este navegador a `origin` (el sitio donde se va a abrir).
 * Devuelve null si no hay sesión, servidor o conexión: el link sale igual, sin la cuenta.
 */
export async function requestHandoff(purpose, { origin = location.origin, storage = store(), fetchImpl = fetch } = {}) {
  const token = get(storage, TOKEN);
  if (!token) return null;
  try {
    const r = await post('/api/rift/handoff', { purpose, origin }, token, fetchImpl);
    return CODE.test(r?.code ?? '') ? r.code : null;
  } catch {
    return null;
  }
}

/**
 * Cambia el código por una sesión en este navegador. Si acá había otra cuenta con dueño (wallet o
 * huella), lo guardado de esa cuenta en el dispositivo se borra, igual que al entrar con la wallet.
 * Devuelve la respuesta del servidor, o null si el código no sirve (vencido, usado o de otro sitio).
 */
export async function redeemHandoff(code, purpose, { origin = location.origin, storage = store(), fetchImpl = fetch } = {}) {
  if (!CODE.test(code ?? '')) return null;
  try {
    const r = await post('/api/rift/handoff/redeem', { code, purpose, origin }, get(storage, TOKEN), fetchImpl);
    if (!r?.token) return null;
    if (r.switched && !r.prevGuest) for (const k of GAME_KEYS) set(storage, k, null);
    set(storage, TOKEN, r.token);
    if (r.account) {
      set(storage, CACHE, JSON.stringify(r.account));
      if (r.account.player?.pid) set(storage, 'riftfall.pid', r.account.player.pid);
    }
    return r;
  } catch {
    return null;
  }
}

/** Saca el código de la dirección (si vino) y lo devuelve. */
export function takeHandoffParam(url, purpose) {
  const name = HANDOFF_PARAM[purpose];
  const code = url.searchParams.get(name);
  url.searchParams.delete(name);
  return code;
}

/** Parte `?a=1&b=2` de un link a partir de los datos que haya (los vacíos no van). */
export function linkQuery(params) {
  const q = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
  return q ? `?${q}` : '';
}
