import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyBoard, BOARD_SIZE, defaultName } from '../../server/world-board.mjs';
import { dailyNumber, dailySeed, DAILY_EPOCH } from '../../src/shared/daily.js';
import { playLocal } from '../helpers.mjs';

const DAY = 86_400_000;
const N = 6;
const NOW = DAILY_EPOCH + (N - 1) * DAY + 3_600_000;
const run = playLocal(dailySeed(N), 'spark', 1, 60 * 40, {}, 1);

function memoryBoard() {
  const store = new Map();
  let writes = 0;
  const board = createDailyBoard({
    load: async (n) => (store.has(n) ? structuredClone(store.get(n)) : null),
    save: async (n, b) => {
      writes++;
      store.set(n, structuredClone(b));
    },
    now: () => NOW
  });
  return { board, store, writes: () => writes };
}
const pid = (c) => c.repeat(16);

test('ranking mundial: la partida se re-juega en el servidor y el puntaje sale de ahí', async () => {
  assert.equal(dailyNumber(NOW), N);
  const { board } = memoryBoard();
  const res = await board.submit({ n: N, pid: pid('a'), name: 'Ana', inputs: run.inputs, choices: run.choices, score: 999_999 });
  assert.equal(res.ok, true);
  assert.equal(res.rank, 1);
  assert.equal(res.score, run.summary.score, 'ignora el puntaje que manda el navegador');
  assert.deepEqual(
    res.board.entries.map((e) => [e.name, e.score]),
    [['Ana', run.summary.score]]
  );
  assert.equal(res.board.entries[0].id.length, 12);
  assert.ok(!JSON.stringify(res.board).includes(pid('a')), 'no publica el id secreto');
});

test('ranking mundial: rechaza otro día, ids raros y partidas que no se pueden re-jugar', async () => {
  const { board } = memoryBoard();
  const base = { n: N, pid: pid('b'), inputs: run.inputs, choices: run.choices };
  assert.equal((await board.submit({ ...base, n: N - 2 })).error, 'day');
  assert.equal((await board.submit({ ...base, n: N + 1 })).error, 'day');
  assert.equal((await board.submit({ ...base, pid: 'hola' })).error, 'player');
  assert.equal((await board.submit({ ...base, choices: [...run.choices, 1] })).error, 'replay');
  assert.equal((await board.submit({ ...base, inputs: [99, 5] })).error, 'replay');
  // La partida de ayer todavía vale (terminó después de medianoche).
  const yesterday = playLocal(dailySeed(N - 1), 'spark', 1, 600, {}, 1);
  assert.equal((await board.submit({ n: N - 1, pid: pid('b'), inputs: yesterday.inputs, choices: yesterday.choices })).ok, true);
});

test('ranking mundial: una fila por jugador con su mejor marca, solo escribe si cambia algo', async () => {
  const { board, writes } = memoryBoard();
  const short = playLocal(dailySeed(N), 'spark', 1, 60 * 10, {}, 1);
  await board.submit({ n: N, pid: pid('c'), name: 'Rodri', inputs: run.inputs, choices: run.choices });
  assert.equal(writes(), 1);
  // Una peor no cambia nada y no escribe.
  const worse = await board.submit({ n: N, pid: pid('c'), name: 'Rodri', inputs: short.inputs, choices: short.choices });
  assert.equal(writes(), 1);
  assert.equal(worse.rank, 1);
  assert.equal(worse.best, run.summary.score);
  // Cambiar el nombre sí se guarda.
  await board.submit({ n: N, pid: pid('c'), name: 'Rodrigo', inputs: short.inputs, choices: short.choices });
  assert.equal(writes(), 2);
  const b = await board.get(N);
  assert.deepEqual(b.entries.map((e) => e.name), ['Rodrigo']);
  // Sin nombre: uno por defecto.
  const anon = await board.submit({ n: N, pid: pid('d'), inputs: short.inputs, choices: short.choices });
  assert.equal(anon.board.entries.find((e) => e.name === defaultName(pid('d'))).score, short.summary.score);
});

test('ranking mundial: guarda solo el top y avisa cuánto falta para entrar', async () => {
  const { board, store } = memoryBoard();
  store.set(N, {
    n: N,
    updatedAt: 1,
    entries: Array.from({ length: BOARD_SIZE }, (_, i) => ({ id: `x${i}`, name: `P${i}`, score: 1e6 - i, timeSec: 600, kills: 1, victory: false, at: 1 }))
  });
  const res = await board.submit({ n: N, pid: pid('e'), inputs: run.inputs, choices: run.choices });
  assert.equal(res.rank, null);
  assert.equal(res.cutoff, 1e6 - BOARD_SIZE + 1);
  assert.equal(store.get(N).entries.length, BOARD_SIZE);
});
