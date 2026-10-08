// Pasar el progreso de un navegador a otro. En el celular, conectar la wallet abre el juego dentro
// de la app de MetaMask, que tiene su propio navegador (con otra memoria): sin esto, el jugador
// llegaba a un juego vacío y parecía que se le habían borrado los puntajes. El progreso viaja en el
// link (comprimido) y al llegar se mezcla con lo que hubiera, sin perder nada de ninguno de los dos.
//
// En el link va solo progreso y preferencias. La cuenta no viaja: va un código de un solo uso que el
// servidor cambia por una sesión nueva (src/rift/handoff.js). La sesión y el id secreto del ranking
// nunca se ponen en un link, ni se aceptan si llegan en uno.

import { mergeProgress } from './progress.js';
import { tierRank } from '../shared/founder.js';
import { packData, unpackData } from '../shared/pack.js';
import { HANDOFF_PARAM, linkQuery, requestHandoff, redeemHandoff, takeHandoffParam } from '../rift/handoff.js';

const PARAM = 'rf';
/** Lo que se lleva: progreso, nombre, Pase Fundador y preferencias. */
const KEYS = [
  'riftfall.progress',
  'riftfall.name',
  'riftfall.founder',
  'riftfall.skin',
  'riftfall.ship',
  'riftfall.rift',
  'riftfall.tutorial',
  'riftfall.lang',
  'riftfall.muted',
  'riftfall.gfx'
];

/** Empaqueta los datos de este navegador en un texto corto para el link. */
export async function packTransfer(storage = localStorage) {
  const data = {};
  for (const k of KEYS) {
    const v = storage.getItem(k);
    if (v != null) data[k.slice('riftfall.'.length)] = v;
  }
  return packData(data);
}

export const unpackTransfer = unpackData;

/**
 * Mezcla los datos recibidos con los de este navegador. El progreso se une (lo mejor de cada lado);
 * el Pase Fundador más alto manda; lo demás solo completa lo que falte. Un link no puede cambiar la
 * sesión ni el id del ranking de este navegador (los links viejos que los traían se ignoran en eso).
 */
export function applyTransfer(data, storage = localStorage) {
  const get = (k) => storage.getItem(`riftfall.${k}`);
  const set = (k, v) => storage.setItem(`riftfall.${k}`, v);
  if (data.progress) {
    let mine = null;
    let theirs = null;
    try { mine = JSON.parse(get('progress') ?? 'null'); } catch { mine = null; }
    try { theirs = JSON.parse(data.progress); } catch { theirs = null; }
    if (theirs) set('progress', JSON.stringify(mergeProgress(mine, theirs)));
  }
  if (data.founder) {
    let mine = null;
    let theirs = null;
    try { mine = JSON.parse(get('founder') ?? 'null'); } catch { mine = null; }
    try { theirs = JSON.parse(data.founder); } catch { theirs = null; }
    if (theirs && tierRank(theirs.tier) >= tierRank(mine?.tier)) set('founder', data.founder);
  }
  for (const k of ['name', 'skin', 'ship', 'rift', 'tutorial', 'lang', 'muted', 'gfx']) {
    if (data[k] != null && get(k) == null) set(k, data[k]);
  }
  // El nombre del ranking y la nave elegida son del jugador: los del link mandan.
  for (const k of ['name', 'ship', 'rift']) if (data[k] != null) set(k, data[k]);
}

/**
 * Si la página se abrió con progreso (y el código de la cuenta) en el link, limpia la dirección, entra
 * a la cuenta y aplica el progreso. Primero la cuenta: si acá había otra, lo suyo se borra antes.
 */
export async function receiveTransfer() {
  const url = new URL(location.href);
  const text = url.searchParams.get(PARAM);
  const code = takeHandoffParam(url, 'open');
  if (!text && !code) return false;
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  const entered = code ? !!(await redeemHandoff(code, 'open')) : false;
  if (!text) return entered;
  try {
    applyTransfer(await unpackTransfer(text));
    return true;
  } catch {
    return false;
  }
}

/**
 * Link para abrir el juego dentro de la app de MetaMask llevando el progreso y, con un código de un
 * solo uso, la cuenta (es tu mismo celular: ahí entrás sin volver a identificarte).
 */
export async function metamaskLink() {
  const [pack, code] = await Promise.all([packTransfer().catch(() => ''), requestHandoff('open')]);
  return `https://metamask.app.link/dapp/${location.host}${location.pathname}${linkQuery({ [PARAM]: pack, [HANDOFF_PARAM.open]: code })}`;
}

/**
 * Link para seguir jugando en otro dispositivo (mismo progreso). Es un link que se copia y se pega:
 * no lleva la cuenta. En el otro dispositivo se entra con la wallet o con huella / Face ID.
 */
export async function continueLink() {
  return `${location.origin}${location.pathname}?${PARAM}=${await packTransfer()}`;
}
