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
  const fullEnv = { DB, ...env };
  const call = async (method, path, { body, token } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await api.handle(new Request(`https://rift.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), fullEnv);
    return { status: res.status, ...(await res.json()) };
  };
  apiRaw = async (e, path, bearer) => {
    const res = await api.handle(new Request(`https://rift.test${path}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }), e);
    return { status: res.status, ...(await res.json()) };
  };
  return { call, advance: (ms) => (t += ms), env: fullEnv };
}
let apiRaw = null;
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const setupWithPayments = () => ({ ...setup(), payments: {} });

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

test('dueño: la wallet que cobra las ventas (o las de ADMIN_WALLETS) marca la cuenta como dueño', async () => {
  const boss = Wallet.createRandom();
  const { call } = setup({ env: { ADMIN_WALLETS: ` ${boss.address} , no-es-wallet` } });
  const g = await call('POST', '/api/rift/guest', {});
  assert.equal(g.account.player.admin, undefined);
  const linked = await walletLogin(call, boss, g.token);
  assert.equal(linked.account.player.admin, true);
  assert.equal((await call('GET', '/api/rift/me', { token: g.token })).account.player.admin, true);
  // Cualquier otra wallet no.
  const other = await call('POST', '/api/rift/guest', {});
  const o = await walletLogin(call, Wallet.createRandom(), other.token);
  assert.equal(o.account.player.admin, undefined);
});

test('dueño: la wallet de la tesorería siempre es dueña, sin configurar nada', async () => {
  const { adminWallets } = await import('../../cloud/api.mjs');
  const { FOUNDER } = await import('../../src/shared/founder.js');
  assert.ok(adminWallets({}).has(FOUNDER.treasury.toLowerCase()));
  assert.equal(adminWallets({ ADMIN_WALLETS: '0xABC' }).size, 1);
});

test('wallet sin decir la dirección antes (celular: conectar y firmar en un paso): la wallet sale de la firma', async () => {
  const { call } = setup();
  const w = Wallet.createRandom();
  const g = await call('POST', '/api/rift/guest', {});
  const n = await call('POST', '/api/rift/wallet/nonce', { body: {} });
  assert.equal(n.status, 200);
  assert.doesNotMatch(n.message, /Wallet:/);
  const signature = await w.signMessage(n.message);
  const r = await call('POST', '/api/rift/wallet/login', { body: { id: n.id, signature }, token: g.token });
  assert.equal(r.linked, true);
  assert.deepEqual(r.account.wallets, [w.address.toLowerCase()]);
  // Una firma rota no entra, y una dirección mal escrita se rechaza.
  const n2 = await call('POST', '/api/rift/wallet/nonce', { body: {} });
  assert.equal((await call('POST', '/api/rift/wallet/login', { body: { id: n2.id, signature: '0x1234' } })).status, 401);
  assert.equal((await call('POST', '/api/rift/wallet/nonce', { body: { address: 'hola' } })).status, 400);
});

test('estadísticas del dueño: guarda de dónde llega cada jugador nuevo y solo el dueño las ve', async () => {
  const boss = Wallet.createRandom();
  const { call } = setup({ env: { ADMIN_WALLETS: boss.address } });
  const { sourceOf, deviceKind } = await import('../../cloud/api.mjs');
  assert.equal(sourceOf('tiktok'), 'tiktok');
  assert.equal(sourceOf('www.instagram.com'), 'instagram');
  assert.equal(sourceOf('l.instagram.com'), 'instagram');
  assert.equal(sourceOf('t.co'), 'x');
  assert.equal(sourceOf('wa'), 'whatsapp');
  assert.equal(sourceOf(''), null);
  assert.equal(sourceOf('Mi Grupo <script>'), 'migruposcript');
  assert.equal(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.equal(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), 'desktop');
  assert.equal(deviceKind('WhatsApp/2.23'), 'bot');

  await call('POST', '/api/rift/guest', { body: { origin: { ref: 'tiktok', tz: 'America/Argentina/Buenos_Aires', lang: 'es-AR', game: 'cargo' } } });
  await call('POST', '/api/rift/guest', { body: { origin: { ref: 'l.instagram.com', tz: 'America/Mexico_City', lang: 'es-MX', game: 'riftfall' } } });
  const nobody = await call('POST', '/api/rift/guest', { body: {} });
  // Alguien que jugó de verdad (partida guardada con contenido).
  assert.equal((await call('PUT', '/api/rift/save', { token: nobody.token, body: { game: 'riftfall', rev: 0, data: { runs: 3, filler: 'x'.repeat(600) } } })).status, 200);
  // Un jugador común no ve las estadísticas (ni sabe que existen).
  assert.equal((await call('GET', '/api/rift/stats', { token: nobody.token })).status, 404);
  assert.equal((await call('GET', '/api/rift/stats')).status, 401);
  const g = await call('POST', '/api/rift/guest', {});
  await walletLogin(call, boss, g.token);
  const r = await call('GET', '/api/rift/stats?tz=-3', { token: g.token });
  assert.equal(r.status, 200);
  const st = r.stats;
  assert.equal(st.totals.players, 4);
  assert.equal(st.totals.played, 1);
  assert.equal(st.recent.filter((x) => x.played).length, 1);
  const src = Object.fromEntries(st.sources.map((x) => [x.k, x.n]));
  assert.equal(src.tiktok, 1);
  assert.equal(src.instagram, 1);
  assert.equal(src.directo, 2);
  assert.ok(st.countries.some((x) => x.k === 'America/Argentina/Buenos_Aires'));
  assert.deepEqual(st.games.map((x) => x.k).sort(), ['?', 'cargo', 'riftfall']);
  assert.equal(st.recent.length, 4);
  assert.equal(st.days.reduce((a, d) => a + d.n, 0), 4);
  assert.ok(Array.isArray(st.purchases));
});

// ---------- Llevar la cuenta a otro navegador sin poner la sesión en el link ----------

const SITE = 'https://rift.test';

test('código de un solo uso: entra a la misma cuenta con una sesión nueva y no se puede volver a usar', async () => {
  const { call } = setup();
  const g = await call('POST', '/api/rift/guest', { body: { name: 'Papá' } });
  const h = await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: g.token });
  assert.equal(h.status, 200);
  assert.match(h.code, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(h.code, g.token);
  const r = await call('POST', '/api/rift/handoff/redeem', { body: { code: h.code, purpose: 'open', origin: SITE } });
  assert.equal(r.status, 200);
  assert.equal(r.account.player.id, g.account.player.id);
  assert.ok(r.token && r.token !== g.token, 'sesión nueva, no la del link');
  assert.equal((await call('GET', '/api/rift/me', { token: r.token })).status, 200);
  assert.equal((await call('GET', '/api/rift/me', { token: g.token })).status, 200, 'el navegador de origen sigue adentro');
  const again = await call('POST', '/api/rift/handoff/redeem', { body: { code: h.code, purpose: 'open', origin: SITE } });
  assert.equal(again.status, 400);
  assert.equal(again.error, 'expired');
});

test('código de un solo uso: sin sesión no se pide, vence a los 5 minutos y pedir otro anula el anterior', async () => {
  const { call, advance } = setup();
  assert.equal((await call('POST', '/api/rift/handoff', { body: { purpose: 'open' } })).status, 401);
  const g = await call('POST', '/api/rift/guest', { body: {} });
  assert.equal((await call('POST', '/api/rift/handoff', { body: { purpose: 'otra-cosa' }, token: g.token })).status, 400);
  const old = await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: g.token });
  advance(5 * 60_000 + 1);
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: old.code, purpose: 'open', origin: SITE } })).status, 400, 'vencido');
  const a = await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: g.token });
  const b = await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: g.token });
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: a.code, purpose: 'open', origin: SITE } })).status, 400, 'anulado por el segundo');
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: b.code, purpose: 'open', origin: SITE } })).status, 200);
});

test('código de un solo uso: solo vale para su uso y su sitio, y un intento equivocado lo quema', async () => {
  const { call } = setup({ env: { ALLOWED_ORIGINS: 'https://otro.test' } });
  const g = await call('POST', '/api/rift/guest', { body: {} });
  const fresh = async (purpose = 'open', origin = SITE) => (await call('POST', '/api/rift/handoff', { body: { purpose, origin }, token: g.token })).code;
  // Otro uso: no sirve (y el código sigue vivo para el uso correcto).
  const c1 = await fresh('open');
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: c1, purpose: 'move', origin: SITE } })).status, 400);
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: c1, purpose: 'open', origin: SITE } })).status, 200);
  // Otro sitio de los permitidos: no sirve, y queda quemado.
  const c2 = await fresh('open', SITE);
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: c2, purpose: 'open', origin: 'https://otro.test' } })).status, 400);
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: c2, purpose: 'open', origin: SITE } })).status, 400);
  // Mudanza: pedido para la dirección nueva, solo se canjea diciendo esa dirección.
  const c3 = await fresh('move', 'https://otro.test');
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: c3, purpose: 'move', origin: 'https://otro.test' } })).status, 200);
  // Un sitio desconocido se rechaza; tampoco se transforma silenciosamente en el sitio propio.
  assert.equal((await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: 'https://malo.example' }, token: g.token })).status, 400);
  const c4 = await fresh();
  assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code: c4, purpose: 'open', origin: 'https://malo.example' } })).status, 400);
  // Formatos raros.
  for (const code of [undefined, 5, '', 'x', 'a'.repeat(44), { $ne: 1 }]) {
    assert.equal((await call('POST', '/api/rift/handoff/redeem', { body: { code, purpose: 'open', origin: SITE } })).status, 400);
  }
});

test('código de un solo uso: dos canjes a la vez, entra uno solo', async () => {
  const { call } = setup();
  const g = await call('POST', '/api/rift/guest', { body: {} });
  const h = await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: g.token });
  const redeem = () => call('POST', '/api/rift/handoff/redeem', { body: { code: h.code, purpose: 'open', origin: SITE } });
  const res = await Promise.all([redeem(), redeem(), redeem()]);
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 400, 400]);
});

test('código de un solo uso: emisiones simultáneas dejan un solo código vivo', async () => {
  const { call } = setup();
  const g = await call('POST', '/api/rift/guest', { body: {} });
  const codes = await Promise.all(Array.from({ length: 4 }, () => call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: g.token })));
  assert.equal(codes.every((r) => r.status === 200), true);
  const results = await Promise.all(codes.map((r) => call('POST', '/api/rift/handoff/redeem', { body: { code: r.code, purpose: 'open', origin: SITE } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400, 400]);
});

test('código de un solo uso: el navegador que lo abre conserva lo suyo si era invitado y cambia de cuenta', async () => {
  const { call, payments } = setupWithPayments();
  const w = Wallet.createRandom();
  const owner = await call('POST', '/api/rift/guest', { body: {} });
  await walletLogin(call, w, owner.token);
  const mm = await call('POST', '/api/rift/guest', { body: {} });
  const h = await call('POST', '/api/rift/handoff', { body: { purpose: 'open', origin: SITE }, token: owner.token });
  const r = await call('POST', '/api/rift/handoff/redeem', { body: { code: h.code, purpose: 'open', origin: SITE }, token: mm.token });
  assert.equal(r.status, 200);
  assert.equal(r.switched, true);
  assert.equal(r.prevGuest, true);
  assert.equal(r.account.player.id, owner.account.player.id);
  assert.deepEqual(r.account.wallets, [w.address.toLowerCase()]);
  assert.equal((await call('GET', '/api/rift/me', { token: mm.token })).status, 401, 'la sesión de invitado de ese navegador se cierra');
  assert.ok(payments);
});

test('revocación: con fecha de corte, las cuentas con wallet vuelven a entrar y los invitados siguen', async () => {
  const cutoffAt = Date.UTC(2026, 9, 6, 16);
  const DBenv = {};
  const { call, advance, env } = setup({ env: DBenv });
  const w = Wallet.createRandom();
  const withWallet = await call('POST', '/api/rift/guest', { body: {} });
  await walletLogin(call, w, withWallet.token);
  await call('PUT', '/api/rift/save', { body: { game: 'riftfall', data: { runs: 7 }, rev: 0 }, token: withWallet.token });
  const guest = await call('POST', '/api/rift/guest', { body: {} });
  // Antes de aplicar: se mide a cuántos afecta.
  env.AUDIT_TOKEN = 'clave';
  const count = async () => {
    const res = await apiRaw(env, `/api/rift/audit/sessions?before=${cutoffAt}`, 'clave');
    return res;
  };
  advance(2 * 3_600_000);
  assert.deepEqual(pick(await count(), ['total', 'revoked', 'kept']), { total: 2, revoked: 1, kept: 1 });
  assert.equal((await call('GET', '/api/rift/me', { token: withWallet.token })).status, 200, 'sin la variable no se revoca nada');
  // Se aplica.
  env.SESSIONS_NOT_BEFORE = new Date(cutoffAt).toISOString();
  assert.equal((await call('GET', '/api/rift/me', { token: withWallet.token })).status, 401);
  assert.equal((await call('GET', '/api/rift/me', { token: guest.token })).status, 200, 'el invitado no pierde su cuenta');
  // Vuelve a entrar con la wallet: misma cuenta, mismo progreso, sesión nueva que ya no se revoca.
  const back = await walletLogin(call, w);
  assert.equal(back.status, 200);
  assert.equal(back.account.player.id, withWallet.account.player.id);
  assert.equal((await call('GET', '/api/rift/save?game=riftfall', { token: back.token })).data.runs, 7);
  assert.equal((await call('GET', '/api/rift/me', { token: back.token })).status, 200);
  assert.deepEqual(pick(await count(), ['total', 'revoked', 'kept']), { total: 1, revoked: 0, kept: 1 });
  // Un valor mal escrito no revoca nada.
  const { sessionCutoff } = await import('../../cloud/api.mjs');
  assert.equal(sessionCutoff({ SESSIONS_NOT_BEFORE: 'pronto' }), 0);
  assert.equal(sessionCutoff({}), 0);
  assert.equal(sessionCutoff({ SESSIONS_NOT_BEFORE: String(cutoffAt) }), cutoffAt);
});
