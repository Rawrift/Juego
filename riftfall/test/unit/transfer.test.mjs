import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress } from '../../src/client/progress.js';
import { packTransfer, unpackTransfer, applyTransfer } from '../../src/client/transfer.js';

class Store {
  constructor(data = {}) { this.m = new Map(Object.entries(data)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}

const chrome = {
  cores: 320, lifetimeCores: 2400, talents: { hull: 3, power: 2 }, riftMax: 2, parts: { 'hull:spark': 2 }, loadout: { hull: 'hull:spark' },
  runs: 14, bestScore: 5210, bestTime: 410, kills: 1900, bosses: 6, victories: 1, streak: 3, lastDay: '2026-10-06', updatedAt: 1000
};

test('al abrir el juego en MetaMask el progreso llega completo (nada se pierde)', async () => {
  const src = new Store({ 'riftfall.progress': JSON.stringify(chrome), 'riftfall.pid': 'ab'.repeat(16), 'riftfall.name': 'Rodri' });
  const text = await packTransfer(src);
  assert.ok(text.length < 1500, `el link no es enorme (${text.length})`);
  const mm = new Store(); // navegador de MetaMask: memoria vacía
  applyTransfer(await unpackTransfer(text), mm);
  const got = JSON.parse(mm.getItem('riftfall.progress'));
  assert.equal(got.bestScore, 5210);
  assert.equal(got.cores, 320);
  assert.deepEqual(got.talents, { hull: 3, power: 2 });
  assert.equal(mm.getItem('riftfall.pid'), 'ab'.repeat(16), 'mismo jugador en el ranking');
  assert.equal(mm.getItem('riftfall.name'), 'Rodri');
});

test('si en MetaMask ya había jugado, se suma lo mejor de los dos', () => {
  const metamask = { ...chrome, runs: 3, bestScore: 7000, cores: 40, talents: { hull: 1, engines: 2 }, parts: { 'wings:phantom': 1 }, updatedAt: 500 };
  const m = mergeProgress(metamask, chrome);
  assert.equal(m.bestScore, 7000, 'récord de MetaMask');
  assert.equal(m.runs, 14);
  assert.equal(m.cores, 320, 'los Núcleos del que se usó último');
  assert.deepEqual(m.talents, { hull: 3, power: 2, engines: 2 });
  assert.deepEqual(m.parts, { 'hull:spark': 2, 'wings:phantom': 1 });
});

test('un progreso vacío nunca pisa uno con partidas', () => {
  const blank = { cores: 0, lifetimeCores: 0, runs: 0, talents: {}, parts: {}, updatedAt: 9_999_999 };
  assert.equal(mergeProgress(chrome, blank).bestScore, 5210);
  assert.equal(mergeProgress(blank, chrome).cores, 320);
  assert.equal(mergeProgress(null, chrome).runs, 14);
});

test('panel del dueño en RIFTFALL: Núcleos, talentos, niveles del Rift y piezas al máximo', async () => {
  const { ownerBoost, loadProgress, OWNER_CORES } = await import('../../src/client/progress.js');
  const { TALENTS, TALENT_MAX, RIFT_MAX, ALL_PARTS, PART_MAX } = await import('../../src/sim/index.js');
  globalThis.localStorage = new Store();
  const p = loadProgress();
  ownerBoost(p, 'cores');
  ownerBoost(p, 'talents');
  ownerBoost(p, 'rift');
  ownerBoost(p, 'parts');
  const back = loadProgress();
  assert.equal(back.cores, OWNER_CORES);
  for (const id of Object.keys(TALENTS)) assert.equal(back.talents[id], TALENT_MAX);
  assert.equal(back.riftMax, RIFT_MAX);
  for (const id of ALL_PARTS) assert.equal(back.parts[id], PART_MAX);
  assert.throws(() => ownerBoost(p, 'nada'));
  delete globalThis.localStorage;
});
