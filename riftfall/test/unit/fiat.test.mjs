// Pago en pesos: configuración, pedido del jugador y reconocimiento firmado del dueño.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { createApi } from '../../cloud/api.mjs';
import { createD1 } from '../../cloud/d1-node.mjs';
import { fiatConfig, fiatCode, fiatCodeLabel, parseFiatCode, parseFiatRef, fiatSellable, FIAT_ITEMS, FIAT_ORDER_TTL, FIAT_REVIEW_WINDOW } from '../../src/shared/fiat.js';
import { STYLE_ITEMS } from '../../src/shared/cargo-style.js';

const CONFIG = {
  FIAT_PAY_URL: 'https://cafecito.app/riftgames',
  FIAT_PRICES: JSON.stringify({ 'founder:pilot': 4500, 'style:trail-magenta': 1500, 'style:pack': 9000 })
};

function setup(extraEnv = {}) {
  let t = Date.UTC(2026, 9, 8, 15);
  const owner = Wallet.createRandom();
  const api = createApi({ now: () => t, chain: { payment: async () => ({ kind: null, reason: 'notFound' }) } });
  const env = { DB: createD1(), ADMIN_WALLETS: owner.address, ...CONFIG, ...extraEnv };
  const call = async (method, path, { body, token } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await api.handle(new Request(`https://rift.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, ...(await res.json()) };
  };
  const withWallet = async (wallet = Wallet.createRandom()) => {
    const g = await call('POST', '/api/rift/guest', { body: {} });
    const n = await call('POST', '/api/rift/wallet/nonce', { body: { address: wallet.address } });
    const r = await call('POST', '/api/rift/wallet/login', { body: { id: n.id, signature: await wallet.signMessage(n.message) }, token: g.token });
    assert.equal(r.status, 200);
    return { token: g.token, wallet, id: g.account.player.id };
  };
  const recognize = async (admin, signer, { code, ars, ref, reason = 'Cobro visto en la app de cobros' }) => {
    const o = await call('POST', '/api/rift/fiat/review/options', { body: { code, ars, ref, reason }, token: admin.token });
    if (o.status !== 200) return o;
    return call('POST', '/api/rift/fiat/review', { body: { id: o.id, signature: await signer.signMessage(o.message) }, token: admin.token });
  };
  return { call, env, owner, withWallet, recognize, advance: (ms) => (t += ms) };
}

test('configuración: sin destino de cobro o sin precios no existe; lo mal escrito se ignora', () => {
  assert.deepEqual(fiatConfig({}), { enabled: false, prices: {} });
  assert.equal(fiatConfig({ FIAT_PAY_URL: CONFIG.FIAT_PAY_URL }).enabled, false, 'sin precios');
  assert.equal(fiatConfig({ FIAT_PRICES: CONFIG.FIAT_PRICES }).enabled, false, 'sin destino');
  assert.equal(fiatConfig({ ...CONFIG, FIAT_PRICES: 'no es json' }).enabled, false);
  // Solo sitios de cobro conocidos, por https y sin trucos.
  for (const url of ['http://cafecito.app/x', 'https://cafecito.app.malo.example/x', 'https://malo.example/cafecito.app', 'https://user:clave@cafecito.app/x', 'javascript:alert(1)', 'https://cafecito.app:8443/x']) {
    assert.equal(fiatConfig({ ...CONFIG, FIAT_PAY_URL: url }).enabled, false, url);
  }
  assert.equal(fiatConfig({ ...CONFIG, FIAT_PAY_URL: 'https://mpago.la/abc123' }).payUrl, 'https://mpago.la/abc123');
  // Alias y titular, los dos o nada.
  const alias = fiatConfig({ FIAT_ALIAS: 'rift.juegos.mp', FIAT_HOLDER: 'Nombre Apellido', FIAT_PRICES: CONFIG.FIAT_PRICES });
  assert.deepEqual([alias.enabled, alias.alias, alias.holder, alias.payUrl], [true, 'rift.juegos.mp', 'Nombre Apellido', undefined]);
  assert.equal(fiatConfig({ FIAT_ALIAS: 'rift.juegos.mp', FIAT_PRICES: CONFIG.FIAT_PRICES }).enabled, false);
  // Precios: pesos enteros, de artículos que se pueden vender así. Lo demás no entra.
  const cfg = fiatConfig({ ...CONFIG, FIAT_PRICES: JSON.stringify({ 'founder:pilot': 4500, 'founder:gold': 9000, 'founder:legend': 20000, 'style:ship-raya': 5000, 'style:fleet': 30000, 'style:plates': 1500.5, 'style:sign': '2000', 'style:liv-aurora': 5, 'otra:cosa': 100, 'style:pack:x': 100 }) });
  assert.deepEqual(cfg.prices, { 'founder:pilot': 4500 });
});

test('lista cerrada: solo el Pase Piloto y estéticos; ningún plano de nave ni nivel con naves', () => {
  assert.deepEqual(FIAT_ITEMS.founder, ['pilot']);
  for (const item of FIAT_ITEMS.style) {
    assert.ok(Object.hasOwn(STYLE_ITEMS, item), item);
    assert.ok(!item.startsWith('ship-') && item !== 'fleet', item);
  }
  assert.equal(fiatSellable('style', 'ship-raya'), false);
  assert.equal(fiatSellable('founder', 'gold'), false);
  assert.equal(fiatSellable('__proto__', 'pilot'), false);
  assert.equal(fiatSellable('style', 'pack'), true);
});

test('código del pedido y referencia del cobro: se leen como los escribe una persona', () => {
  const code = fiatCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(parseFiatCode(fiatCodeLabel(code)), code);
  assert.equal(parseFiatCode(` rift ${code.slice(0, 5).toLowerCase()} ${code.slice(5).toLowerCase()} `), code);
  for (const bad of ['', 'RIFT-ABCDE', 'RIFT-ABCDE-FGHI0', 'ABCDEFGHJK1', null]) assert.equal(parseFiatCode(bad), null, String(bad));
  assert.equal(parseFiatRef(' 123456789012 '), '123456789012');
  assert.equal(parseFiatRef('MP-Op.99_1'), 'mp-op.99_1');
  for (const bad of ['', 'abc', 'con espacio 123', '<script>', 'a'.repeat(41), 'https://x.y/z']) assert.equal(parseFiatRef(bad), null, bad);
});

test('apagado: sin configuración completa las rutas no existen', async () => {
  const { call, withWallet } = setup({ FIAT_PAY_URL: '' });
  assert.deepEqual(await call('GET', '/api/rift/fiat'), { status: 200, ok: true, enabled: false, prices: {} });
  const p = await withWallet();
  assert.equal((await call('POST', '/api/rift/fiat/order', { body: { kind: 'founder', item: 'pilot' }, token: p.token })).status, 404);
});

test('pedido: precio y artículo los fija el servidor; hace falta cuenta protegida; queda pendiente y sin beneficio', async () => {
  const { call, withWallet } = setup();
  const cfg = await call('GET', '/api/rift/fiat');
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.payUrl, CONFIG.FIAT_PAY_URL);
  assert.equal(cfg.prices['founder:pilot'], 4500);
  assert.equal((await call('POST', '/api/rift/fiat/order', { body: { kind: 'founder', item: 'pilot' } })).status, 401);
  // Invitado sin huella ni wallet: primero protege la cuenta.
  const guest = await call('POST', '/api/rift/guest', { body: {} });
  const noCred = await call('POST', '/api/rift/fiat/order', { body: { kind: 'founder', item: 'pilot' }, token: guest.token });
  assert.deepEqual([noCred.status, noCred.error], [403, 'protect']);
  const p = await withWallet();
  // Lo que no se vende en pesos, o no tiene precio cargado, no se puede pedir.
  for (const body of [{ kind: 'founder', item: 'gold' }, { kind: 'style', item: 'ship-raya' }, { kind: 'style', item: 'liv-aurora' }, { kind: 'x', item: 'y' }, {}]) {
    assert.equal((await call('POST', '/api/rift/fiat/order', { body, token: p.token })).status, 400, JSON.stringify(body));
  }
  // El comprador no puede elegir el importe.
  const r = await call('POST', '/api/rift/fiat/order', { body: { kind: 'founder', item: 'pilot', ars: 1, code: 'AAAAAAAAAA', status: 'paid' }, token: p.token });
  assert.equal(r.status, 200);
  assert.equal(r.order.ars, 4500);
  assert.equal(r.order.status, 'pending');
  assert.match(r.order.code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.notEqual(r.order.code, 'AAAAAAAAAA');
  assert.equal(r.order.expiresAt - r.order.createdAt, FIAT_ORDER_TTL);
  // Pendiente: ninguna compra en la cuenta todavía.
  assert.deepEqual((await call('GET', '/api/rift/me', { token: p.token })).account.purchases, []);
  const mine = await call('GET', '/api/rift/fiat/orders', { token: p.token });
  assert.deepEqual(mine.orders.map((o) => [o.code, o.status]), [[r.order.code, 'pending']]);
  // Los pedidos de otra cuenta no se ven ni se cancelan.
  const other = await withWallet();
  assert.deepEqual((await call('GET', '/api/rift/fiat/orders', { token: other.token })).orders, []);
  assert.equal((await call('POST', '/api/rift/fiat/cancel', { body: { id: r.order.id }, token: other.token })).status, 400);
  assert.equal((await call('POST', '/api/rift/fiat/cancel', { body: { id: r.order.id }, token: p.token })).status, 200);
  assert.equal((await call('GET', '/api/rift/fiat/orders', { token: p.token })).orders[0].status, 'cancelled');
});

test('límites: 3 pendientes y 10 pedidos por día por cuenta, también con pedidos a la vez', async () => {
  const { call, withWallet, advance } = setup();
  const p = await withWallet();
  const order = (item) => call('POST', '/api/rift/fiat/order', { body: { kind: 'style', item }, token: p.token });
  const burst = await Promise.all([order('pack'), order('pack'), order('pack'), order('pack'), order('pack')]);
  assert.deepEqual(burst.map((r) => r.status).sort(), [200, 200, 200, 429, 429]);
  assert.equal(new Set(burst.filter((r) => r.ok).map((r) => r.order.code)).size, 3, 'códigos distintos');
  // Cancelar libera el cupo de pendientes, pero no el del día.
  let made = 3;
  for (let i = 0; i < 12; i++) {
    const open = (await call('GET', '/api/rift/fiat/orders', { token: p.token })).orders.find((o) => o.status === 'pending');
    await call('POST', '/api/rift/fiat/cancel', { body: { id: open.id }, token: p.token });
    const r = await order('trail-magenta');
    if (r.status === 200) made++;
    else {
      assert.equal(r.error, 'tooManyOrders');
      break;
    }
  }
  assert.equal(made, 10);
  advance(86_400_001);
  assert.equal((await order('trail-magenta')).status, 200, 'al otro día se puede de nuevo');
});

test('reconocimiento: solo el dueño, con su firma; importe exacto; la compra aparece recién ahí', async () => {
  const { call, withWallet, recognize, owner } = setup();
  const buyer = await withWallet();
  const { order } = await call('POST', '/api/rift/fiat/order', { body: { kind: 'founder', item: 'pilot' }, token: buyer.token });
  const admin = await withWallet(owner);
  // Para quien no es el dueño, las rutas no existen.
  assert.equal((await call('GET', '/api/rift/fiat/pending', { token: buyer.token })).status, 404);
  assert.equal((await call('POST', '/api/rift/fiat/review/options', { body: { code: order.code, ars: 4500, ref: 'op-1001', reason: 'Cobro visto en la app' }, token: buyer.token })).status, 404);
  const pending = await call('GET', '/api/rift/fiat/pending', { token: admin.token });
  assert.deepEqual(pending.orders.map((o) => [o.code, o.ars, o.item]), [[order.code, 4500, 'pilot']]);
  assert.ok(!JSON.stringify(pending).includes(buyer.id), 'el panel no dice de quién es el pedido');
  // Importe distinto, referencia rara o motivo corto: no se arma nada para firmar.
  const opts = (body) => call('POST', '/api/rift/fiat/review/options', { body: { code: order.code, ars: 4500, ref: 'op-1001', reason: 'Cobro visto en la app', ...body }, token: admin.token });
  assert.deepEqual([(await opts({ ars: 4499 })).error, (await opts({ ars: '4500' })).error, (await opts({ ref: 'x y' })).error, (await opts({ reason: 'ok' })).error, (await opts({ code: 'RIFT-AAAAA-AAAAA' })).error],
    ['amount', 'amount', 'badOrder', 'badOrder', 'noOrder']);
  const o = await opts({ code: `rift ${order.code.toLowerCase()}` });
  assert.equal(o.status, 200);
  // El mensaje dice todo lo que queda registrado.
  for (const part of [order.id, 'ARS 4500', 'op-1001', 'founder/pilot', 'rift.test', 'No mueve fondos']) assert.ok(o.message.includes(part), part);
  // Firma de otra wallet: no vale, y esa firma ya no se puede reintentar.
  const stranger = await call('POST', '/api/rift/fiat/review', { body: { id: o.id, signature: await Wallet.createRandom().signMessage(o.message) }, token: admin.token });
  assert.deepEqual([stranger.status, stranger.error], [403, 'signature']);
  assert.equal((await call('POST', '/api/rift/fiat/review', { body: { id: o.id, signature: await owner.signMessage(o.message) }, token: admin.token })).status, 400);
  assert.deepEqual((await call('GET', '/api/rift/me', { token: buyer.token })).account.purchases, [], 'todavía sin beneficio');
  // Ahora sí.
  assert.equal((await recognize(admin, owner, { code: order.code, ars: 4500, ref: 'OP-1001' })).status, 200);
  const purchases = (await call('GET', '/api/rift/me', { token: buyer.token })).account.purchases;
  assert.equal(purchases.length, 1);
  assert.deepEqual([purchases[0].tx, purchases[0].kind, purchases[0].item, purchases[0].method, purchases[0].usd, purchases[0].payer], [`fiat:${order.id}`, 'founder', 'pilot', 'ars-manual', null, null]);
  assert.equal((await call('GET', '/api/rift/fiat/orders', { token: buyer.token })).orders[0].status, 'paid');
  assert.deepEqual((await call('GET', '/api/rift/fiat/pending', { token: admin.token })).orders, []);
});

test('sin doble derecho: un pedido se acredita una vez y una referencia de cobro sirve para una sola cuenta', async () => {
  const { call, withWallet, recognize, owner, env } = setup();
  const admin = await withWallet(owner);
  const a = await withWallet();
  const b = await withWallet();
  const orderA = (await call('POST', '/api/rift/fiat/order', { body: { kind: 'style', item: 'trail-magenta' }, token: a.token })).order;
  const orderB = (await call('POST', '/api/rift/fiat/order', { body: { kind: 'style', item: 'trail-magenta' }, token: b.token })).order;
  // Dos reconocimientos del mismo pedido a la vez: entra uno.
  const two = await Promise.all([recognize(admin, owner, { code: orderA.code, ars: 1500, ref: 'op-2001' }), recognize(admin, owner, { code: orderA.code, ars: 1500, ref: 'op-2002' })]);
  assert.deepEqual(two.map((r) => r.status).sort(), [200, 409]);
  // El pedido ya pagado no se vuelve a reconocer.
  const again = await recognize(admin, owner, { code: orderA.code, ars: 1500, ref: 'op-2003' });
  assert.deepEqual([again.status, again.error], [409, 'claimed']);
  // La referencia que se usó no sirve para el pedido de otra cuenta (ni escrita en mayúsculas).
  const used = (await env.DB.prepare('SELECT payment_ref FROM fiat_reviews').first()).payment_ref;
  const reuse = await recognize(admin, owner, { code: orderB.code, ars: 1500, ref: used.toUpperCase() });
  assert.deepEqual([reuse.status, reuse.error], [409, 'refUsed']);
  assert.deepEqual((await call('GET', '/api/rift/me', { token: b.token })).account.purchases, []);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM fiat_reviews').first()).n, 1);
  // Queda registrado quién reconoció, con qué wallet, cuánto y por qué. Nada del comprador más que su cuenta.
  const review = await env.DB.prepare('SELECT * FROM fiat_reviews').first();
  assert.deepEqual([review.order_id, review.admin_id, review.signer, review.player_id, review.ars], [orderA.id, admin.id, owner.address.toLowerCase(), a.id, 1500]);
  // Quien ya lo tiene no puede volver a pedirlo (no paga dos veces por lo mismo).
  const dup = await call('POST', '/api/rift/fiat/order', { body: { kind: 'style', item: 'trail-magenta' }, token: a.token });
  assert.deepEqual([dup.status, dup.error], [409, 'owned']);
});

test('pago tardío y pedidos cerrados: vencido se reconoce hasta 30 días; cancelado o muy viejo, no', async () => {
  const { call, withWallet, recognize, owner, advance } = setup();
  const admin = await withWallet(owner);
  const buyer = await withWallet();
  const late = (await call('POST', '/api/rift/fiat/order', { body: { kind: 'founder', item: 'pilot' }, token: buyer.token })).order;
  const cancelled = (await call('POST', '/api/rift/fiat/order', { body: { kind: 'style', item: 'pack' }, token: buyer.token })).order;
  await call('POST', '/api/rift/fiat/cancel', { body: { id: cancelled.id }, token: buyer.token });
  const c = await recognize(admin, owner, { code: cancelled.code, ars: 9000, ref: 'op-3001' });
  assert.deepEqual([c.status, c.error], [409, 'cancelled']);
  advance(FIAT_ORDER_TTL + 1);
  const view = (await call('GET', '/api/rift/fiat/pending', { token: admin.token })).orders.find((o) => o.code === late.code);
  assert.equal(view.expired, true);
  assert.equal((await recognize(admin, owner, { code: late.code, ars: 4500, ref: 'op-3002' })).status, 200);
  // Otro pedido, que nadie reconoce en 30 días.
  const old = (await call('POST', '/api/rift/fiat/order', { body: { kind: 'style', item: 'trail-magenta' }, token: buyer.token })).order;
  advance(FIAT_REVIEW_WINDOW + 1);
  const o = await recognize(admin, owner, { code: old.code, ars: 1500, ref: 'op-3003' });
  assert.deepEqual([o.status, o.error], [404, 'noOrder']);
  assert.deepEqual((await call('GET', '/api/rift/fiat/pending', { token: admin.token })).orders, []);
});
