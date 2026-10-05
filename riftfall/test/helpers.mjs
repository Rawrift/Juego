import { createSim, stepSim, chooseUpgrade, summarize, botInput, botChoice, InputRecorder } from '../src/sim/index.js';

/** Juega una partida con el bot y devuelve el resumen y la grabación de entradas. */
export function playLocal(seed, ship, shipLevel, maxTicks, talents = null) {
  const s = createSim({ seed, ship, shipLevel, talents });
  const rec = new InputRecorder();
  while ((s.phase === 'running' || s.phase === 'choice') && s.tick < maxTicks) {
    if (s.phase === 'choice') {
      const c = botChoice(s);
      rec.choice(c);
      chooseUpgrade(s, c);
      continue;
    }
    const d = botInput(s);
    rec.push(d);
    stepSim(s, d);
    s.events.length = 0;
  }
  return { summary: summarize(s), ...rec.finish() };
}
