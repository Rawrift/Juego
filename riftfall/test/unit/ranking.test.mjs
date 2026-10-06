import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunBoard, RUN_BOARD_SIZE } from '../../server/run-board.mjs';
import { DAILY_EPOCH } from '../../src/shared/daily.js';
import { playLocal } from '../helpers.mjs';

const DAY = 86_400_000;
let clock = DAILY_EPOCH + 9 * DAY + 3_600_000;

function memoryBoard() {
  let stored = null;
  let writes = 0;
  const board = createRunBoard({
    load: async () => (stored ? structuredClone(stored) : null),
    save: async (b) => {
      writes++;
      stored = structuredClone(b);
    },
    now: () => clock
  });
  return { board, writes: () => writes };
}
const pid = (c) => c.repeat(16);
const talents = { hull: 3, power: 2 };
const dad = playLocal(777, 'spark', 1, 60 * 45, talents, 1);
const kid = playLocal(1234, 'spark', 1, 60 * 20, {}, 0);
const runOf = (seed, rec, extra = {}) => ({ seed, ship: 'spark', shipLevel: 1, talents: {}, rift: 0, parts: null, inputs: rec.inputs, choices: rec.choices, ...extra });

test('ranking compartido: re-juega la partida con su nave, talentos y Rift', async () => {
  const { board } = memoryBoard();
  const res = await board.submit({ pid: pid('a'), name: 'Rodri', score: 999_999, ...runOf(777, dad, { talents, rift: 1 }) });
  assert.equal(res.ok, true);
  assert.equal(res.score, dad.summary.score, 'el puntaje sale del servidor, no del navegador');
  assert.equal(res.rankToday, 1);
  assert.equal(res.rankAll, 1);
  assert.equal(res.board.today[0].rift, 1);
  assert.ok(!JSON.stringify(res.board).includes(pid('a')), 'no publica el id secreto');
});

test('ranking compartido: dos jugadores se ven entre sí y cada uno conserva su mejor marca', async () => {
  const { board, writes } = memoryBoard();
  await board.submit({ pid: pid('a'), name: 'Papá', ...runOf(777, dad, { talents, rift: 1 }) });
  await board.submit({ pid: pid('b'), name: 'Hijo', ...runOf(1234, kid) });
  const view = await board.get();
  assert.deepEqual(view.today.map((e) => e.name).sort(), ['Hijo', 'Papá']);
  const before = writes();
  // Una partida peor del mismo jugador no cambia nada ni escribe.
  const worse = playLocal(55, 'spark', 1, 60 * 5, {}, 0);
  const r = await board.submit({ pid: pid('b'), name: 'Hijo', ...runOf(55, worse) });
  assert.equal(r.ok, true);
  assert.equal(writes(), before);
  assert.equal((await board.get()).today.length, 2);
});

test('ranking compartido: "Hoy" empieza vacío al día siguiente y el histórico queda', async () => {
  const { board } = memoryBoard();
  await board.submit({ pid: pid('a'), name: 'Papá', ...runOf(1234, kid) });
  clock += DAY;
  const view = await board.get();
  assert.equal(view.today.length, 0);
  assert.equal(view.all.length, 1);
  clock -= DAY;
});

test('ranking compartido: valida nave, nivel, Rift e id', async () => {
  const { board } = memoryBoard();
  const base = { pid: pid('c'), ...runOf(1234, kid) };
  assert.equal((await board.submit({ ...base, pid: 'x' })).error, 'player');
  assert.equal((await board.submit({ ...base, ship: 'ovni' })).error, 'ship');
  assert.equal((await board.submit({ ...base, shipLevel: 99 })).error, 'ship');
  assert.equal((await board.submit({ ...base, rift: 99 })).error, 'rift');
  assert.equal((await board.submit({ ...base, seed: -1 })).error, 'seed');
  assert.equal((await board.submit({ ...base, choices: [...kid.choices, 2] })).error, 'replay');
  assert.ok(RUN_BOARD_SIZE >= 50);
});
