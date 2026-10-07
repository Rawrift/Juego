// Dirección única del juego: riftfall.duckdns.org (el link de siempre). Vercel reenvía esa dirección
// a Cloudflare, donde corre el juego con la Cuenta Rift. Quien abre otra dirección (la de Vercel o la de
// Cloudflare) va a esa llevando en el link lo que tenía guardado en ese navegador (progreso de
// RIFTFALL y de Rift Cargo, Pase Fundador y estéticos), sin perder nada. La cuenta no va en el link:
// viaja con un código de un solo uso que el sitio nuevo cambia por una sesión (handoff.js).

import { packData, unpackData } from '../shared/pack.js';
import { HANDOFF_PARAM, PRIVATE_KEYS, requestHandoff, redeemHandoff, takeHandoffParam } from './handoff.js';

/** Dirección nueva del juego. Vacía = todavía no hay mudanza (el sitio funciona donde esté). */
export const CANONICAL = 'https://riftfall.duckdns.org';
const OLD_HOSTS = /(^|\.)vercel\.app$|(^|\.)pages\.dev$/;
const PARAM = 'mv';

function storageDump() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^(riftfall|riftcargo|rift)\./.test(k) && !PRIVATE_KEYS.includes(k)) data[k] = localStorage.getItem(k);
    }
  } catch {
    /* sin almacenamiento */
  }
  return data;
}

/** En la dirección vieja: manda a la nueva con los datos. Devuelve true si se está yendo. */
export async function moveIfOldHost() {
  if (!CANONICAL || !OLD_HOSTS.test(location.hostname)) return false;
  // El código se pide para la dirección nueva: en cualquier otro sitio no sirve.
  const [pack, code] = await Promise.all([packData(storageDump()).catch(() => ''), requestHandoff('move', { origin: CANONICAL })]);
  const url = new URL(location.pathname + location.search, CANONICAL);
  if (pack) url.searchParams.set(PARAM, pack);
  if (code) url.searchParams.set(HANDOFF_PARAM.move, code);
  location.replace(url.toString());
  return true;
}

/**
 * En la dirección nueva: si llegó la mudanza, se aplica con las mismas reglas que el paso a MetaMask
 * (se mezcla con lo que hubiera, sin pisar nada mejor). `applyRiftfall` y `applyCargo` vienen de cada juego.
 */
export async function receiveMove({ applyRiftfall, applyCargo }) {
  const url = new URL(location.href);
  const text = url.searchParams.get(PARAM);
  const code = takeHandoffParam(url, 'move');
  if (!text && !code) return false;
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  // La cuenta llega con el código (es el mismo navegador de la misma persona), nunca en los datos.
  const entered = code ? !!(await redeemHandoff(code, 'move')) : false;
  if (!text) return entered;
  try {
    const all = await unpackData(text);
    const rf = {};
    const cg = {};
    for (const [k, v] of Object.entries(all)) {
      if (PRIVATE_KEYS.includes(k)) continue;
      if (k.startsWith('riftfall.')) rf[k.slice('riftfall.'.length)] = v;
      if (k.startsWith('riftcargo.') || k === 'riftfall.founder') cg[k] = v;
    }
    applyRiftfall?.(rf);
    applyCargo?.(cg);
    return true;
  } catch {
    return false;
  }
}
