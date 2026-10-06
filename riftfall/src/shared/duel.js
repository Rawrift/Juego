// Duelo con amigos: una partida con reglas parejas (como el Desafío del Día) cuya semilla y
// resultado viajan dentro de un link. Quien lo abre juega el mismo mapa con la misma nave y compara.
// No hay servidor: el control del final detecta links rotos o editados a mano, no es seguridad
// (el duelo no da recompensas que valga la pena falsificar).

import { seedFromString } from '../sim/rng.js';

/** Mismas condiciones para los dos: nave inicial, sin habilidades ni piezas, Rift base. */
export const DUEL_RULES = { ship: 'spark', shipLevel: 1, rift: 0 };
export const NAME_MAX = 16;

/** Nombre de piloto apto para mostrar: sin caracteres de control ni marcas, máximo 16. */
export function cleanName(s) {
  return Array.from(String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim())
    .slice(0, NAME_MAX)
    .join('');
}

function toB64url(str) {
  let bin = '';
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const check = (body) => (seedFromString(`riftfall-duel|${body}`) % 36 ** 4).toString(36).padStart(4, '0');
const int36 = (n) => Math.max(0, Math.floor(Number(n) || 0)).toString(36);

/** Código del reto para el link: `1.semilla.puntos.segundos.bajas.victoria.nombre.control`. */
export function encodeDuel({ seed, score, timeSec, kills, victory, name }) {
  const body = ['1', (seed >>> 0).toString(36), int36(score), int36(timeSec), int36(kills), victory ? '1' : '0', toB64url(cleanName(name))].join('.');
  return `${body}.${check(body)}`;
}

/** Lee un código de reto. Devuelve null si está roto o fue editado. */
export function decodeDuel(code) {
  const parts = String(code ?? '').trim().split('.');
  if (parts.length !== 8 || parts[0] !== '1') return null;
  const body = parts.slice(0, 7).join('.');
  if (parts[7] !== check(body)) return null;
  const num = (s, max) => {
    if (!/^[0-9a-z]{1,8}$/.test(s)) return null;
    const n = parseInt(s, 36);
    return n <= max ? n : null;
  };
  const seed = num(parts[1], 2 ** 32 - 1);
  const score = num(parts[2], 1e9);
  const timeSec = num(parts[3], 3600);
  const kills = num(parts[4], 1e6);
  if ([seed, score, timeSec, kills].includes(null) || !['0', '1'].includes(parts[5])) return null;
  let name = '';
  try {
    name = cleanName(fromB64url(parts[6]));
  } catch {
    return null;
  }
  return { seed, score, timeSec, kills, victory: parts[5] === '1', name };
}

/** Link del reto (la portada del juego con el código). */
export function duelUrl(origin, duel) {
  return `${origin}/?duel=${encodeDuel(duel)}`;
}
