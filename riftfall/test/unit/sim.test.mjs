import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createSim,
  stepSim,
  chooseUpgrade,
  summarize,
  stateHash,
  botInput,
  botChoice,
  InputRecorder,
  replayRun,
  dsin,
  MAX_TICKS
} from '../../src/sim/index.js';
import { dsin as dsin2, dcos } from '../../src/sim/dmath.js';

function playBot(seed, ship = 'spark', shipLevel = 1, maxTicks = MAX_TICKS) {
  const s = createSim({ seed, ship, shipLevel });
  const rec = new InputRecorder();
  while ((s.phase === 'running' || s.phase === 'choice') && s.tick < maxTicks) {
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
  }
  return { s, rec: rec.finish() };
}

test('la simulación no usa funciones matemáticas no deterministas', () => {
  const dir = path.resolve('src/sim');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const bad of ['Math.random', 'Math.sin', 'Math.cos', 'Math.tan', 'Math.atan', 'Math.pow', 'Math.exp', 'Math.log', 'Math.hypot', 'Date.now', 'performance.now']) {
      assert.ok(!src.includes(bad), `${f} usa ${bad}`);
    }
  }
});

test('dsin/dcos son precisos', () => {
  for (let x = -20; x <= 20; x += 0.37) {
    assert.ok(Math.abs(dsin2(x) - Math.sin(x)) < 1e-9, `sin ${x}`);
    assert.ok(Math.abs(dcos(x) - Math.cos(x)) < 1e-9, `cos ${x}`);
  }
  assert.equal(typeof dsin, 'function');
});

test('misma semilla y mismas entradas producen exactamente la misma partida', () => {
  const a = playBot(42, 'spark', 1, 60 * 90);
  const b = playBot(42, 'spark', 1, 60 * 90);
  assert.equal(stateHash(a.s), stateHash(b.s));
  assert.deepEqual(summarize(a.s), summarize(b.s));
  const c = playBot(43, 'spark', 1, 60 * 90);
  assert.notEqual(stateHash(a.s), stateHash(c.s));
});

test('el replay del servidor reproduce la partida grabada', () => {
  const { s, rec } = playBot(777, 'phantom', 3, 60 * 150);
  const r = replayRun({ seed: 777, ship: 'phantom', shipLevel: 3, ...rec });
  assert.ok(r.ok, r.error);
  assert.equal(r.hash, stateHash(s));
  assert.deepEqual(r.summary, summarize(s));
});

test('el replay rechaza partidas manipuladas', () => {
  const { rec } = playBot(5, 'spark', 1, 60 * 60);
  const base = { seed: 5, ship: 'spark', shipLevel: 1 };
  assert.equal(replayRun({ ...base, inputs: [...rec.inputs, 99, 1], choices: rec.choices }).ok, false);
  assert.equal(replayRun({ ...base, inputs: [1, MAX_TICKS + 1], choices: [] }).ok, false);
  assert.equal(replayRun({ ...base, inputs: [1, 0], choices: [] }).ok, false);
  assert.equal(replayRun({ ...base, inputs: rec.inputs, choices: [...rec.choices, 1] }).ok, false);
  if (rec.choices.length) {
    assert.equal(replayRun({ ...base, inputs: rec.inputs, choices: rec.choices.slice(0, -1) }).ok, false);
  }
  // Cambiar la nave declarada cambia el resultado: el servidor usa la nave verificada on-chain.
  const honest = replayRun({ ...base, ...rec });
  const other = replayRun({ ...base, ship: 'leviathan', shipLevel: 10, ...rec });
  assert.ok(honest.ok);
  assert.ok(!other.ok || other.hash !== honest.hash);
});

test('quedarse quieto termina en derrota y da pocas recompensas', () => {
  const s = createSim({ seed: 9 });
  let guard = 0;
  while (s.phase !== 'dead' && guard++ < MAX_TICKS) {
    if (s.phase === 'choice') chooseUpgrade(s, 0);
    else stepSim(s, 0);
    s.events.length = 0;
  }
  assert.equal(s.phase, 'dead');
  const sum = summarize(s);
  assert.ok(sum.timeSec < 400, `sobrevivió ${sum.timeSec}s sin moverse`);
  assert.ok(sum.shardsEarned < 120);
});

test('las naves NFT multiplican la recompensa según clase y nivel de forja', () => {
  const s1 = createSim({ seed: 1, ship: 'spark' });
  const s2 = createSim({ seed: 1, ship: 'leviathan', shipLevel: 10 });
  s1.shards = s2.shards = 100;
  assert.equal(summarize(s1).shardsEarned, 100);
  assert.equal(summarize(s2).shardsEarned, Math.floor(100 * (1 + 0.5 + 0.27)));
  assert.equal(createSim({ seed: 1, ship: 'spark', shipLevel: 10 }).shipLevel, 1);
});
