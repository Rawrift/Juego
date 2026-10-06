// Pasar el progreso de un navegador a otro. En el celular, conectar la wallet abre el juego dentro
// de la app de MetaMask, que tiene su propio navegador (con otra memoria): sin esto, el jugador
// llegaba a un juego vacío y parecía que se le habían borrado los puntajes. El progreso viaja en el
// link (comprimido) y al llegar se mezcla con lo que hubiera, sin perder nada de ninguno de los dos.

import { mergeProgress } from './progress.js';
import { tierRank } from '../shared/founder.js';
import { packData, unpackData } from '../shared/pack.js';

const PARAM = 'rf';
/** Lo que se lleva: progreso, identidad en el ranking, nombre, Pase Fundador y preferencias. */
const KEYS = [
  'riftfall.progress',
  'riftfall.pid',
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
 * el id del jugador y el Pase Fundador del link mandan; lo demás solo completa lo que falte.
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
  if (/^[a-f0-9]{32}$/.test(data.pid ?? '')) set('pid', data.pid);
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

/** Si la página se abrió con progreso en el link, lo aplica y limpia la dirección. */
export async function receiveTransfer() {
  const url = new URL(location.href);
  const text = url.searchParams.get(PARAM);
  if (!text) return false;
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    applyTransfer(await unpackTransfer(text));
    return true;
  } catch {
    return false;
  }
}

/** Link para abrir el juego dentro de la app de MetaMask llevando el progreso. */
export async function metamaskLink() {
  let pack = '';
  try {
    pack = await packTransfer();
  } catch {
    pack = '';
  }
  const path = `${location.host}${location.pathname}${pack ? `?${PARAM}=${pack}` : ''}`;
  return `https://metamask.app.link/dapp/${path}`;
}

/** Link para seguir jugando en otro dispositivo (mismo progreso). */
export async function continueLink() {
  return `${location.origin}${location.pathname}?${PARAM}=${await packTransfer()}`;
}
