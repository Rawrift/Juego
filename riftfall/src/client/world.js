// Ranking mundial del Desafío del Día: lo guarda la función /api/daily de la web del juego, que
// vuelve a jugar cada partida antes de anotarla. En los portales no existe (no hay servidor propio).

import { PORTAL } from './portal.js';
import { authHeaders } from '../rift/account.js';

const PID_KEY = 'riftfall.pid';
export const WORLD = !PORTAL;

/** Id secreto y anónimo de este dispositivo (identifica tu fila en el ranking). */
export function playerId() {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!/^[a-f0-9]{32}$/.test(id ?? '')) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** El id público de tu fila (el servidor publica un resumen del id secreto, nunca el id). */
export async function myPublicId() {
  const pid = playerId();
  if (!pid || !crypto.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`riftfall-player|${pid}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

/** Lo que dice la partida de sí misma (el servidor lo controla y lo audita volviéndola a jugar). */
const pickSummary = (s) => (s ? { score: s.score, timeSec: s.timeSec, kills: s.kills, victory: !!s.victory } : null);

/** Nombre que usa el servidor si no elegiste uno. */
export function defaultName() {
  return `Piloto ${String(playerId() ?? '????').slice(0, 4).toUpperCase()}`;
}

export async function fetchWorldDaily(n) {
  const res = await fetch(`/api/daily?n=${n}`);
  const data = res.ok ? await res.json().catch(() => null) : null;
  if (!Array.isArray(data?.entries)) throw new Error(`ranking ${res.status}`);
  return data;
}

/** Manda la partida (sus entradas) para que el servidor la verifique y la anote. */
export async function submitWorldDaily({ n, name, rec, summary = null }) {
  const pid = playerId();
  if (!pid) throw new Error('sin almacenamiento');
  // Con Cuenta Rift la partida queda en tu cuenta (en cualquier dispositivo).
  const res = await fetch('/api/daily', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ n, pid, name, inputs: rec.inputs, choices: rec.choices, summary: pickSummary(summary) })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

// --------------------------------------------------------------------- Ranking de todas las partidas

/** Ranking compartido de partidas normales: { day, today, all }. */
export async function fetchRunBoard() {
  const res = await fetch('/api/ranking');
  const data = res.ok ? await res.json().catch(() => null) : null;
  if (!Array.isArray(data?.today) || !Array.isArray(data?.all)) throw new Error(`ranking ${res.status}`);
  return data;
}

/** Manda una partida normal (con su nave, talentos, piezas y Rift) para que el servidor la re-juegue. */
export async function submitRunBoard({ name, run, rec, summary = null }) {
  const pid = playerId();
  if (!pid) throw new Error('sin almacenamiento');
  const res = await fetch('/api/ranking', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      summary: pickSummary(summary),
      pid,
      name,
      seed: run.seed,
      ship: run.ship,
      shipLevel: run.shipLevel,
      talents: run.talents,
      rift: run.rift ?? 0,
      parts: run.parts ?? null,
      inputs: rec.inputs,
      choices: rec.choices
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}
