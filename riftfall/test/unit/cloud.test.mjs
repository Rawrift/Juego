// Cuenta Rift: invitado, wallet, progreso en la nube, compras atadas a la wallet que pagó y
// rankings con control rápido (y auditoría después).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { createApi } from '../../cloud/api.mjs';
import { createD1 } from '../../cloud/d1-node.mjs';
import { quickVerify, scoreCap } from '../../cloud/quick-verify.mjs';
import { playLocal } from '../helpers.mjs';

function setup({ payments = {}, env = {} } = {}) {
  let t = Date.UTC(2026, 9, 6, 15);
  const chain = { payment: async (tx) => payments[tx] ?? { kind: null, reason: 'notFound' } };
  const api = createApi({ now: () => t, chain });
  const DB = createD1();
  const call = async (method, path, { body, token } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await api.handle(new Request(`https://rift.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), { DB, ...env });
    return { status: res.status, ...(await res.json()) };
  };
  return { call, advance: (ms) => (t += ms) };
}

async function walletLogin(call, wallet, token) {
  const n = await call('POST', '/api/rift/wallet/nonce', { body: { address: wallet.address } });
  assert.equal(n.status, 200);
  assert.match(n.message, /no cuesta nada/);
  const signature = await wallet.signMessage(n.message);
  return call('POST', '/api/rift/wallet/login', { body: { id: n.id, signature }, token });
}

test('invitado: entra al instante, conserva el id del navegador y elige nombre', async () => {
  const { call } = setup();
  const pid = 'ab'.repeat(16);
  const g = await call('POST', '/api/rift/guest', { body: { pid, name: 'Papá' } });
  assert.equal(g.status, 200);
  assert.ok(g.token);
  assert.equal(g.account.player.pid, pid);
  assert.equal(g.account.player.name, 'Papá');
  assert.equal(g.account.player.guest, true);
  // Otro navegador no puede quedarse con el mismo id.
  const other = await call('POST', '/api/rift/guest', { body: { pid } });
  assert.notEqual(other.account.player.pid, pid);
  const me = await call('GET', '/api/rift/me', { token: g.token });
  assert.equal(me.account.player.name, 'Papá');
  const renamed = await call('POST', '/api/rift/name', { token: g.token, body: { name: '  Rodri<b>  ' } });
  assert.equal(renamed.account.player.name, 'Rodrib');
  assert.equal((await call('GET', '/api/rift/me')).status, 401);
});

test('progreso en la nube: versiones, y si otro dispositivo guardó antes devuelve lo suyo', async () => {
  const { call } = setup();
  const { token } = await call('POST', '/api/rift/guest', {});
  assert.deepEqual(await call('GET', '/api/rift/save?game=riftfall', { token }), { status: 200, ok: true, data: null, rev: 0, updatedAt: 0 });
  const a = await call('PUT', '/api/rift/save', { token, body: { game: 'riftfall', data: { bestScore: 100 }, rev: 0 } });
  assert.equal(a.rev, 1);
  const b = await call('PUT', '/api/rift/save', { token, body: { game: 'riftfall', data: { bestScore: 200 }, rev: 1 } });
  assert.equal(b.rev, 2);
  const stale = await call('PUT', '/api/rift/save', { token, body: { game: 'riftfall', data: { bestScore: 150 }, rev: 1 } });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data, { bestScore: 200 });
  assert.equal(stale.rev, 2);
  assert.equal((await call('PUT', '/api/rift/save', { token, body: { game: 'otro', data: {}, rev: 0 } })).status, 400);
  // Cada juego tiene lo suyo.
  await call('PUT', '/api/rift/save', { token, body: { game: 'cargo', data: { credits: 5 }, rev: 0 } });
  assert.deepEqual((await call('GET', '/api/rift/save?game=cargo', { token })).data, { credits: 5 });
});

test('wallet: firmar (gratis) la suma a la cuenta; en otro dispositivo, firmar entra a la misma cuenta', async () => {
  const { call } = setup();
  const w = Wallet.createRandom();
  const phone = await call('POST', '/api/rift/guest', { body: { name: 'Papá' } });
  const linked = await walletLogin(call, w, phone.token);
  assert.equal(linked.linked, true);
  assert.deepEqual(linked.account.wallets, [w.address.toLowerCase()]);
  assert.equal(linked.account.player.guest, false);
  await call('PUT', '/api/rift/save', { token: phone.token, body: { game: 'riftfall', data: { bestScore: 999 }, rev: 0 } });

  // Otra compu: arranca como invitado y firma con la misma wallet.
  const pc = await call('POST', '/api/rift/guest', {});
  const back = await walletLogin(call, w, pc.token);
  assert.equal(back.switched, true);
  assert.equal(back.prevGuest, true);
  assert.equal(back.account.player.id, linked.account.player.id);
  assert.deepEqual((await call('GET', '/api/rift/save?game=riftfall', { token: back.token })).data, { bestScore: 999 });
  // La sesión de invitado de la compu ya no sirve.
  assert.equal((await call('GET', '/api/rift/me', { token: pc.token })).status, 401);

  // Firma de otra wallet o código vencido: no entra.
  const n = await call('POST', '/api/rift/wallet/nonce', { body: { address: w.address } });
  const forged = await call('POST', '/api/rift/wallet/login', { body: { id: n.id, signature: await Wallet.createRandom().signMessage(n.message) } });
  assert.equal(forged.status, 401);
  const reused = await call('POST', '/api/rift/wallet/login', { body: { id: n.id, signature: await w.signMessage(n.message) } });
  assert.equal(reused.error, 'expired');
});

test('compras: solo las suma el dueño de la wallet que pagó, y un pago no se puede usar dos veces', async () => {
  const w = Wallet.createRandom();
  const TX = `0x${'ab'.repeat(32)}`;
  const { call } = setup({ payments: { [TX]: { kind: 'style', item: 'pack', payer: w.address.toLowerCase(), usd: 7, method: 'usdt' } } });
  const me = await call('POST', '/api/rift/guest', {});
  const need = await call('POST', '/api/rift/purchase', { token: me.token, body: { tx: TX } });
  assert.equal(need.status, 403);
  assert.equal(need.error, 'linkWallet');
  await walletLogin(call, w, me.token);
  const ok = await call('POST', '/api/rift/purchase', { token: me.token, body: { tx: TX } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.account.purchases.map((p) => [p.kind, p.item]), [['style', 'pack']]);
  assert.equal((await call('POST', '/api/rift/purchase', { token: me.token, body: { tx: TX } })).status, 200);
  // Otro jugador que copia el hash de BscScan no se la queda.
  const thief = await call('POST', '/api/rift/guest', {});
  assert.equal((await call('POST', '/api/rift/purchase', { token: thief.token, body: { tx: TX } })).error, 'claimed');
  assert.equal((await call('POST', '/api/rift/purchase', { token: me.token, body: { tx: `0x${'cd'.repeat(32)}` } })).error, 'notFound');
});

test('entrar a otra cuenta desde una que ya tiene wallet no mezcla las compras', async () => {
  const w = Wallet.createRandom();
  const w2 = Wallet.createRandom();
  const TX = `0x${'ef'.repeat(32)}`;
  const { call } = setup({ payments: { [TX]: { kind: 'founder', item: 'gold', payer: w2.address.toLowerCase(), usd: 10, method: 'usdt' } } });
  const main = await call('POST', '/api/rift/guest', {});
  await walletLogin(call, w, main.token);
  // En otro dispositivo, un invitado compra con otra wallet y después entra a la cuenta principal.
  const g = await call('POST', '/api/rift/guest', {});
  await walletLogin(call, w2, g.token);
  await call('POST', '/api/rift/purchase', { token: g.token, body: { tx: TX } });
  // g ya tiene credenciales (la wallet 2): entrar a la principal no mueve sus compras.
  const sw = await walletLogin(call, w, g.token);
  assert.equal(sw.prevGuest, false);
  assert.deepEqual(sw.account.purchases, []);
});

test('ranking: control rápido de la partida, queda pendiente de auditoría y la auditoría saca las falsas', async () => {
  const AUDIT = 'clave-de-auditoria-de-prueba';
  const { call } = setup({ env: { AUDIT_TOKEN: AUDIT } });
  const { token, account } = await call('POST', '/api/rift/guest', { body: { name: 'Papá' } });
  const run = playLocal(4242, 'spark', 1, 60 * 40, {}, 0);
  const body = { pid: 'ff'.repeat(16), name: 'otro', seed: 4242, ship: 'spark', shipLevel: 1, talents: {}, rift: 0, parts: null, inputs: run.inputs, choices: run.choices, summary: run.summary };
  const ok = await call('POST', '/api/ranking', { token, body });
  assert.equal(ok.status, 200);
  assert.equal(ok.score, run.summary.score);
  assert.equal(ok.rankToday, 1);
  // Con sesión manda la cuenta (nombre e id), no lo que diga el navegador.
  const board = await call('GET', '/api/ranking');
  assert.equal(board.today[0].name, 'Papá');
  assert.equal(board.today[0].pending, true);

  // Un puntaje imposible para lo que duró la grabación se rechaza al instante.
  const fake = await call('POST', '/api/ranking', { token, body: { ...body, summary: { ...run.summary, score: scoreCap(run.summary.timeSec) + 1 } } });
  assert.equal(fake.status, 400);

  // La auditoría vuelve a jugarla: si el puntaje no coincide, sale del ranking.
  const pend = await call('GET', '/api/rift/audit', { token: AUDIT });
  assert.equal(pend.runs.length, 1);
  assert.equal(pend.runs[0].player_pid, account.player.pid);
  assert.deepEqual(pend.runs[0].claimed.score, run.summary.score);
  assert.equal((await call('GET', '/api/rift/audit', { token: 'otra' })).status, 404);
  await call('POST', '/api/rift/audit', { token: AUDIT, body: { id: pend.runs[0].id, ok: false, board: 'runs', pid: account.player.pid, claimed: pend.runs[0].claimed } });
  const after = await call('GET', '/api/ranking');
  assert.equal(after.today.length, 0);
  assert.equal((await call('GET', '/api/rift/audit', { token: AUDIT })).runs.length, 0);
});

test('ranking con verificación completa (plan pago): re-juega y no confía en el resumen', async () => {
  const { call } = setup({ env: { FULL_VERIFY: '1' } });
  const { token } = await call('POST', '/api/rift/guest', {});
  const run = playLocal(77, 'spark', 1, 60 * 20, {}, 0);
  const body = { seed: 77, ship: 'spark', shipLevel: 1, talents: {}, rift: 0, parts: null, inputs: run.inputs, choices: run.choices, summary: { ...run.summary, score: 999999 } };
  const ok = await call('POST', '/api/ranking', { token, body });
  assert.equal(ok.score, run.summary.score);
  assert.equal((await call('GET', '/api/ranking')).today[0].pending, undefined);
});

test('control rápido: rechaza grabaciones rotas y resúmenes inventados', () => {
  assert.equal(quickVerify({ inputs: [0], choices: [] }).ok, false);
  assert.equal(quickVerify({ inputs: [0, 60], choices: [], claimed: { score: 10, timeSec: 5, kills: 0 } }).error, 'dura más que la grabación');
  assert.equal(quickVerify({ inputs: [0, 600], choices: [], claimed: { score: 10, timeSec: 10, kills: 1 } }).ok, true);
  assert.equal(quickVerify({ inputs: [0, 600], choices: [], claimed: { score: -1, timeSec: 10, kills: 1 } }).ok, false);
});

test('passkeys desde el link de siempre (duckdns, que llega reenviado): solo direcciones de la lista', async () => {
  const { call } = setup();
  const { token } = await call('POST', '/api/rift/guest', {});
  const duck = await call('POST', '/api/rift/passkey/options', { token, body: { mode: 'register', origin: 'https://riftfall.duckdns.org' } });
  assert.equal(duck.options.rp.id, 'riftfall.duckdns.org');
  const evil = await call('POST', '/api/rift/passkey/options', { token, body: { mode: 'register', origin: 'https://evil.example' } });
  assert.equal(evil.options.rp.id, 'rift.test');
  const login = await call('POST', '/api/rift/passkey/options', { body: { mode: 'login', origin: 'https://riftfall.duckdns.org' } });
  assert.equal(login.options.rpId, 'riftfall.duckdns.org');
  const n = await call('POST', '/api/rift/wallet/nonce', { body: { address: Wallet.createRandom().address, origin: 'https://riftfall.duckdns.org' } });
  assert.match(n.message, /Sitio: riftfall\.duckdns\.org/);
});
