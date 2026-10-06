// Dirección única del juego: riftfall.duckdns.org (el link de siempre). Vercel reenvía esa dirección
// a Cloudflare, donde corre el juego con la Cuenta Rift. Quien abre otra dirección (la de Vercel o la de
// Cloudflare) va a esa llevando en el link todo lo que tenía guardado en ese navegador (progreso de
// RIFTFALL y de Rift Cargo, Pase Fundador, estéticos y la sesión de la cuenta), sin perder nada.

import { packData, unpackData } from '../shared/pack.js';

/** Dirección nueva del juego. Vacía = todavía no hay mudanza (el sitio funciona donde esté). */
export const CANONICAL = 'https://riftfall.duckdns.org';
const OLD_HOSTS = /(^|\.)vercel\.app$|(^|\.)pages\.dev$/;
const PARAM = 'mv';

function storageDump() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^(riftfall|riftcargo|rift)\./.test(k)) data[k] = localStorage.getItem(k);
    }
  } catch {
    /* sin almacenamiento */
  }
  return data;
}

/** En la dirección vieja: manda a la nueva con los datos. Devuelve true si se está yendo. */
export async function moveIfOldHost() {
  if (!CANONICAL || !OLD_HOSTS.test(location.hostname)) return false;
  let pack = '';
  try {
    pack = await packData(storageDump());
  } catch {
    pack = '';
  }
  const url = new URL(location.pathname + location.search, CANONICAL);
  if (pack) url.searchParams.set(PARAM, pack);
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
  if (!text) return false;
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    const all = await unpackData(text);
    const rf = {};
    const cg = {};
    // La sesión de la cuenta viaja con la mudanza (es el mismo navegador de la misma persona).
    if (/^[A-Za-z0-9_-]{20,100}$/.test(all['rift.session'] ?? '') && !localStorage.getItem('rift.session')) {
      localStorage.setItem('rift.session', all['rift.session']);
    }
    for (const [k, v] of Object.entries(all)) {
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
