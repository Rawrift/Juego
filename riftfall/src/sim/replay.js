// Grabación compacta de entradas (RLE) y re-simulación de partidas para el servidor.

import { createSim, stepSim, chooseUpgrade, summarize, stateHash, MAX_TICKS, DIR_COUNT } from './sim.js';

export const MAX_INPUT_NUMBERS = 120_000;

export class InputRecorder {
  constructor() {
    this.runs = [];
    this.last = -1;
    this.count = 0;
    this.choices = [];
  }

  push(dir) {
    if (dir === this.last) {
      this.count++;
      return;
    }
    if (this.count > 0) this.runs.push(this.last, this.count);
    this.last = dir;
    this.count = 1;
  }

  choice(index) {
    this.choices.push(index);
  }

  finish() {
    const inputs = this.runs.slice();
    if (this.count > 0) inputs.push(this.last, this.count);
    return { inputs, choices: this.choices.slice() };
  }
}

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Re-simula una partida completa. Devuelve el resumen calculado por el propio servidor;
 * nunca se confía en los números que reporte el cliente.
 */
export function replayRun({ seed, ship, shipLevel, talents, inputs, choices }) {
  if (!Array.isArray(inputs) || inputs.length % 2 !== 0 || inputs.length > MAX_INPUT_NUMBERS) {
    return { ok: false, error: 'inputs inválidos' };
  }
  if (!Array.isArray(choices) || choices.length > 400) return { ok: false, error: 'choices inválidos' };
  let total = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const dir = inputs[i];
    const count = inputs[i + 1];
    if (!isInt(dir) || dir < 0 || dir > DIR_COUNT || !isInt(count) || count <= 0) {
      return { ok: false, error: 'entrada fuera de rango' };
    }
    total += count;
  }
  if (total > MAX_TICKS) return { ok: false, error: 'partida demasiado larga' };
  for (const c of choices) if (!isInt(c) || c < 0 || c > 2) return { ok: false, error: 'choice fuera de rango' };

  const s = createSim({ seed, ship, shipLevel, talents });
  let ci = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const dir = inputs[i];
    const count = inputs[i + 1];
    for (let c = 0; c < count; c++) {
      while (s.phase === 'choice') {
        if (ci >= choices.length || !chooseUpgrade(s, choices[ci++])) {
          return { ok: false, error: 'falta una elección de mejora' };
        }
      }
      if (s.phase !== 'running') return { ok: false, error: 'entradas después del final' };
      stepSim(s, dir);
      s.events.length = 0;
    }
  }
  while (s.phase === 'choice' && ci < choices.length) chooseUpgrade(s, choices[ci++]);
  if (ci !== choices.length) return { ok: false, error: 'elecciones sobrantes' };
  return { ok: true, phase: s.phase, summary: summarize(s), hash: stateHash(s) };
}
