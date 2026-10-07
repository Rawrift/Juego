import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress } from '../../src/client/progress.js';
import { packTransfer, unpackTransfer, applyTransfer } from '../../src/client/transfer.js';

class Store {
  constructor(data = {}) { this.m = new Map(Object.entries(data)); }
  removeItem(k) { this.m.delete(k); }
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
  assert.equal(mm.getItem('riftfall.name'), 'Rodri');
});

test('el link no lleva la sesión ni el id secreto del ranking, y uno que los traiga no los cambia', async () => {
  const token = 'S'.repeat(43);
  const src = new Store({ 'riftfall.progress': JSON.stringify(chrome), 'riftfall.pid': 'ab'.repeat(16), 'rift.session': token, 'rift.account': '{"player":{"id":"x"}}' });
  const data = await unpackTransfer(await packTransfer(src));
  assert.deepEqual(Object.keys(data), ['progress']);
  assert.ok(!JSON.stringify(data).includes(token) && !JSON.stringify(data).includes('ab'.repeat(16)));
  // Un link viejo (o armado por otra persona) con sesión e id: el progreso se mezcla, lo demás se ignora.
  const victim = new Store({ 'rift.session': 'V'.repeat(43), 'riftfall.pid': 'cd'.repeat(16) });
  applyTransfer({ ...data, session: 'A'.repeat(43), pid: 'ef'.repeat(16) }, victim);
  assert.equal(victim.getItem('rift.session'), 'V'.repeat(43));
  assert.equal(victim.getItem('riftfall.pid'), 'cd'.repeat(16));
  assert.equal(JSON.parse(victim.getItem('riftfall.progress')).bestScore, 5210);
  const fresh = new Store();
  applyTransfer({ session: 'A'.repeat(43), pid: 'ef'.repeat(16) }, fresh);
  assert.equal(fresh.getItem('rift.session'), null);
  assert.equal(fresh.getItem('riftfall.pid'), null);
});

test('código de un solo uso en el navegador: se pide con la sesión, se canjea por otra y un fallo no rompe nada', async () => {
  const { requestHandoff, redeemHandoff, takeHandoffParam, linkQuery, GAME_KEYS } = await import('../../src/rift/handoff.js');
  const code = 'c'.repeat(43);
  const calls = [];
  const server = (reply) => async (path, init) => {
    calls.push({ path, auth: init.headers.authorization ?? null, body: JSON.parse(init.body) });
    return { ok: reply.ok !== false, json: async () => reply };
  };
  // Sin sesión no se pide nada.
  assert.equal(await requestHandoff('open', { origin: 'https://a.test', storage: new Store(), fetchImpl: server({ ok: true, code }) }), null);
  assert.equal(calls.length, 0);
  const src = new Store({ 'rift.session': 'S'.repeat(43) });
  assert.equal(await requestHandoff('open', { origin: 'https://a.test', storage: src, fetchImpl: server({ ok: true, code }) }), code);
  assert.deepEqual(calls[0], { path: '/api/rift/handoff', auth: `Bearer ${'S'.repeat(43)}`, body: { purpose: 'open', origin: 'https://a.test' } });
  // Sin conexión, o una respuesta rara: no hay código y el link sale igual.
  assert.equal(await requestHandoff('open', { origin: 'https://a.test', storage: src, fetchImpl: async () => { throw new Error('red'); } }), null);
  assert.equal(await requestHandoff('open', { origin: 'https://a.test', storage: src, fetchImpl: server({ ok: true, code: 'corto' }) }), null);

  // Canje en un navegador vacío: queda la sesión nueva y la cuenta.
  const mm = new Store();
  const account = { player: { id: 'p1', pid: 'ab'.repeat(16) } };
  const r = await redeemHandoff(code, 'open', { origin: 'https://a.test', storage: mm, fetchImpl: server({ ok: true, token: 'N'.repeat(43), switched: true, prevGuest: true, account }) });
  assert.ok(r);
  assert.equal(mm.getItem('rift.session'), 'N'.repeat(43));
  assert.equal(mm.getItem('riftfall.pid'), 'ab'.repeat(16));
  // Si acá había otra cuenta con dueño, lo suyo se borra del dispositivo.
  const other = new Store({ 'rift.session': 'O'.repeat(43), 'riftfall.progress': '{"runs":9}', 'riftcargo.save': '{}', 'riftfall.lang': 'es' });
  await redeemHandoff(code, 'open', { origin: 'https://a.test', storage: other, fetchImpl: server({ ok: true, token: 'N'.repeat(43), switched: true, prevGuest: false, account }) });
  for (const k of GAME_KEYS) assert.equal(other.m.has(k), false, k);
  assert.equal(other.getItem('riftfall.lang'), 'es');
  // Código vencido o con formato raro: no se toca nada.
  const keep = new Store({ 'rift.session': 'O'.repeat(43), 'riftfall.progress': '{"runs":9}' });
  assert.equal(await redeemHandoff(code, 'open', { origin: 'https://a.test', storage: keep, fetchImpl: server({ ok: false, error: 'expired' }) }), null);
  const before = calls.length;
  assert.equal(await redeemHandoff('<script>', 'open', { origin: 'https://a.test', storage: keep, fetchImpl: server({ ok: true, token: 'X'.repeat(43) }) }), null);
  assert.equal(calls.length, before, 'un código con formato raro ni se manda');
  assert.equal(keep.getItem('rift.session'), 'O'.repeat(43));
  assert.equal(keep.getItem('riftfall.progress'), '{"runs":9}');

  const url = new URL(`https://a.test/?rf=zABC&rc=${code}&ref=tiktok`);
  assert.equal(takeHandoffParam(url, 'open'), code);
  assert.equal(url.search, '?rf=zABC&ref=tiktok');
  assert.equal(linkQuery({ rf: 'zABC', rc: null }), '?rf=zABC');
  assert.equal(linkQuery({ rf: '', rc: null }), '');
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
