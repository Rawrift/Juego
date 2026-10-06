// Guardado en el navegador. Al volver se simula el tiempo que pasó (hasta 2 horas): las naves con
// piloto automático siguen trabajando y los viajes en curso terminan.

import { newGame, fastForward, VERSION } from './sim/sim.js';
import { OFFLINE_MAX } from './sim/data.js';

const KEY = 'riftcargo.save';

export function load() {
  let state = null;
  let away = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.v === VERSION && data.state) {
        state = data.state;
        state.events = [];
        const gone = Math.min(OFFLINE_MAX, Math.max(0, (Date.now() - data.at) / 1000));
        if (gone > 5) away = fastForward(state, gone);
      }
    }
  } catch {
    state = null;
  }
  if (!state) state = newGame(Date.now());
  return { state, away };
}

export function save(state) {
  try {
    const { events, ...rest } = state;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, at: Date.now(), state: rest }));
  } catch {}
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch {}
}
