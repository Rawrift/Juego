// Corre partidas con el bot para medir dificultad, recompensas y rendimiento de la simulación.
//   node scripts/balance.mjs [partidas] [nave] [nivel]
import { createSim, stepSim, chooseUpgrade, summarize, botInput, botChoice, InputRecorder, replayRun } from '../src/sim/index.js';

const runs = Number(process.argv[2] ?? 6);
const ship = process.argv[3] ?? 'spark';
const level = Number(process.argv[4] ?? 1);

const rows = [];
for (let r = 0; r < runs; r++) {
  const seed = 1000 + r * 7919;
  const s = createSim({ seed, ship, shipLevel: level });
  const rec = new InputRecorder();
  const t0 = performance.now();
  let maxEnemies = 0;
  while (s.phase === 'running' || s.phase === 'choice') {
    if (s.phase === 'choice') {
      const c = botChoice(s);
      rec.choice(c);
      chooseUpgrade(s, c);
      continue;
    }
    const dir = botInput(s);
    rec.push(dir);
    stepSim(s, dir);
    s.events.length = 0;
    if (s.enemies.length > maxEnemies) maxEnemies = s.enemies.length;
  }
  const simMs = performance.now() - t0;
  const sum = summarize(s);
  const t1 = performance.now();
  const rep = replayRun({ seed, ship, shipLevel: level, ...rec.finish() });
  const repMs = performance.now() - t1;
  rows.push({
    seed,
    time: `${Math.floor(sum.timeSec / 60)}:${String(sum.timeSec % 60).padStart(2, '0')}`,
    kills: sum.kills,
    lvl: sum.level,
    bosses: sum.bossesKilled,
    shards: sum.shardsEarned,
    score: sum.score,
    maxEn: maxEnemies,
    weapons: s.player.weapons.map((w) => `${w.id}${w.level}`).join(' '),
    simMs: Math.round(simMs),
    replayMs: Math.round(repMs),
    replayOk: rep.ok && rep.summary.score === sum.score
  });
}
console.table(rows);
const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
console.log(`promedio shards=${avg('shards')} kills=${avg('kills')} score=${avg('score')} replay=${avg('replayMs')}ms`);
