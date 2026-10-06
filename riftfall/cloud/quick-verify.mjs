// Control rápido de una partida para el ranking. Volver a jugarla entera tarda de 30 a 600 ms de
// procesador y el plan gratis de Cloudflare da 10 ms por pedido: acá solo se revisa que la grabación
// sea válida y que el puntaje sea posible para lo que duró. La partida queda guardada completa y
// `scripts/audit-runs.mjs` la vuelve a jugar después (y saca del ranking las que no coinciden).

import { MAX_TICKS, DIR_COUNT, TICK_RATE } from '../src/sim/sim.js';

const isInt = (n) => Number.isInteger(n);
const MAX_INPUT_NUMBERS = 200_000;

/** Puntaje máximo creíble para una partida de `sec` segundos (generoso: lo fino lo hace la auditoría). */
export const scoreCap = (sec) => (sec * 80 + 12_000) * 4;

export function quickVerify({ inputs, choices, claimed }) {
  if (!Array.isArray(inputs) || inputs.length % 2 !== 0 || inputs.length > MAX_INPUT_NUMBERS) return { ok: false, error: 'inputs inválidos' };
  if (!Array.isArray(choices) || choices.length > 400) return { ok: false, error: 'choices inválidos' };
  let ticks = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const dir = inputs[i];
    const count = inputs[i + 1];
    if (!isInt(dir) || dir < 0 || dir > DIR_COUNT || !isInt(count) || count <= 0) return { ok: false, error: 'entrada fuera de rango' };
    ticks += count;
  }
  if (ticks > MAX_TICKS) return { ok: false, error: 'partida demasiado larga' };
  for (const c of choices) if (!isInt(c) || c < 0 || c > 2) return { ok: false, error: 'choice fuera de rango' };
  const s = claimed ?? {};
  const timeSec = Number(s.timeSec);
  const score = Number(s.score);
  const kills = Number(s.kills);
  if (![timeSec, score, kills].every((n) => isInt(n) && n >= 0)) return { ok: false, error: 'resumen inválido' };
  if (timeSec > Math.floor(ticks / TICK_RATE) + 1) return { ok: false, error: 'dura más que la grabación' };
  if (score > scoreCap(timeSec) || kills > timeSec * 40 + 50) return { ok: false, error: 'puntaje imposible' };
  return { ok: true, pending: true, summary: { score, timeSec, kills, victory: !!s.victory } };
}
