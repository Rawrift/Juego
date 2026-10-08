import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Wallet } from 'ethers';
import { createApi } from '../../cloud/api.mjs';
import { createD1 } from '../../cloud/d1-node.mjs';
import { mercadoPagoConfig, safeCheckoutUrl } from '../../cloud/mercadopago.mjs';

const CONFIG = { MP_ENABLED: 'true', MP_ACCESS_TOKEN: 'test-token-not-a-real-credential', MP_WEBHOOK_SECRET: 'test-secret-not-a-real-credential',
  MP_COLLECTOR_ID: '123456', MP_LIVE_MODE: 'false', MP_PRICES: JSON.stringify({ 'style:trail-magenta': 1500, 'style:liv-aurora': 3000 }) };
function setup(extra = {}) {
  let time = Date.UTC(2026, 9, 8, 15);
  const payments = new Map(); const calls = []; let preference; let failPost = false; let failGet = false; let redirectPost = false;
  const fetcher = async (url, init) => {
    const u = new URL(url); calls.push({ path: u.pathname, method: init.method });
    assert.equal(u.origin, 'https://api.mercadopago.com');
    assert.equal(init.headers.authorization, `Bearer ${CONFIG.MP_ACCESS_TOKEN}`);
    assert.equal(init.redirect, 'manual', 'Workers no admite redirect:error; nunca seguir otro destino con la clave');
    if (u.pathname === '/checkout/preferences' && init.method === 'POST') {
      if (redirectPost) return new Response(null, { status: 302, headers: { location: 'https://other.example/collect' } });
      const b = JSON.parse(init.body); preference = { ...b, id: 'test-preference', collector_id: 123456, init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=test-preference' };
      if (failPost) throw new Error('connection lost after create');
      return Response.json(preference);
    }
    if (failGet) throw new Error('offline');
    if (u.pathname === '/users/me') return Response.json({ id: 123456, test_user: extra.fakeSellerTestUser === true });
    if (u.pathname === '/checkout/preferences/search') return Response.json({ elements: preference ? [preference] : [] });
    if (u.pathname.startsWith('/checkout/preferences/')) return Response.json(preference);
    if (u.pathname === '/v1/payments/search') return Response.json({ results: [...payments.values()].filter((p) => p.external_reference === u.searchParams.get('external_reference')) });
    if (u.pathname === '/v1/chargebacks/77777') {
      assert.equal(init.headers['x-caller-id'], '123456');
      return Response.json({ id: '77777', payments: ['99999'] });
    }
    const p = payments.get(u.pathname.split('/').at(-1));
    return p ? Response.json(p) : Response.json({}, { status: 404 });
  };
  const env = { DB: createD1(), ...CONFIG, ...extra };
  const api = createApi({ now: () => time, mercadoPagoFetch: fetcher });
  const call = async (method, path, { body, token, headers = {} } = {}) => {
    const r = await api.handle(new Request(`https://rift.test${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    return { status: r.status, ...(await r.json()) };
  };
  const buyer = async () => {
    const g = await call('POST', '/api/rift/guest', { body: {} });
    const w = Wallet.createRandom();
    const n = await call('POST', '/api/rift/wallet/nonce', { body: { address: w.address } });
    await call('POST', '/api/rift/wallet/login', { token: g.token, body: { id: n.id, signature: await w.signMessage(n.message) } });
    return g;
  };
  const pay = (order, overrides = {}) => {
    const p = { id: '99999', external_reference: order.id, collector_id: 123456, live_mode: false, currency_id: 'ARS', transaction_amount: order.ars,
      transaction_amount_refunded: 0, status: 'approved', date_created: new Date(time).toISOString(), date_last_updated: new Date(time).toISOString(), ...overrides };
    payments.set(String(p.id), p); return p;
  };
  const webhook = async (payment, overrides = {}, body = { type: 'payment', data: { id: payment.id } }) => {
    const requestId = 'test-request'; const ts = String(Math.floor(time / 1000));
    const v1 = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(`id:${payment.id};request-id:${requestId};ts:${ts};`).digest('hex');
    return call('POST', `/api/rift/mp/webhook?data.id=${payment.id}&type=payment`, { body, headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${v1}`, ...overrides } });
  };
  return { env, calls, call, buyer, pay, webhook, tick: (ms = 31000) => time += ms, failPost: () => failPost = true, failGet: () => failGet = true, redirectPost: () => redirectPost = true };
}

test('MP: modo del vendedor ficticio se acepta solo tras verificarlo; vendedor real se rechaza', async () => {
  for (const testUser of [false, true]) {
    const s = setup({ MP_TEST_ACCOUNT: 'true', fakeSellerTestUser: testUser });
    const b = await s.buyer();
    const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
    const payment = s.pay(order, { live_mode: true });
    const result = await s.webhook(payment);
    assert.equal(result.status, testUser ? 200 : 409);
    assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, testUser ? 1 : 0);
  }
});

test('MP: una redirección del proveedor no reenvía credenciales ni acredita una compra', async () => {
  const s = setup(); const b = await s.buyer(); s.redirectPost();
  const result = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  assert.equal(result.status, 503);
  assert.equal(s.calls.length, 1);
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 0);
});

test('MP: apagado sin configuración completa; solo cosméticos y destinos oficiales HTTPS', () => {
  assert.equal(mercadoPagoConfig({}).enabled, false);
  assert.equal(mercadoPagoConfig(CONFIG).enabled, true);
  for (const key of ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'MP_COLLECTOR_ID', 'MP_LIVE_MODE', 'MP_PRICES']) assert.equal(mercadoPagoConfig({ ...CONFIG, [key]: '' }).enabled, false, key);
  assert.deepEqual(mercadoPagoConfig({ ...CONFIG, MP_PRICES: '{"founder:pilot":4500,"style:ship-raya":1000,"style:trail-magenta":1500}' }).prices, { 'style:trail-magenta': 1500 });
  for (const u of ['http://www.mercadopago.com/x', 'https://www.mercadopago.com.malo.example/x', 'https://x:y@www.mercadopago.com/x', 'javascript:alert(1)', 'https://www.mercadopago.com:8443/x']) assert.equal(safeCheckoutUrl(u), null);
});

test('MP: el servidor fija precio, vendedor y artículo; protege la cuenta y no duplica pedidos concurrentes', async () => {
  const s = setup();
  const guest = await s.call('POST', '/api/rift/guest', { body: {} });
  assert.equal((await s.call('POST', '/api/rift/mp/order', { token: guest.token, body: { item: 'trail-magenta' } })).status, 403);
  const b = await s.buyer();
  const order = () => s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta', ars: 1, collector_id: '666' } });
  const [a, c] = await Promise.all([order(), order()]);
  assert.equal(a.status, 200); assert.equal(c.status, 200); assert.equal(a.order.id, c.order.id); assert.equal(a.order.ars, 1500);
  assert.equal(s.calls.filter((c) => c.method === 'POST').length, 1);
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 0);
  assert.equal((await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'ship-raya' } })).status, 400);
  assert.ok(!JSON.stringify(await s.call('GET', '/api/rift/mp')).includes(CONFIG.MP_ACCESS_TOKEN));
});

test('MP: firma inválida y cuerpo distinto a la URL no consultan ni acreditan; retorno del navegador tampoco', async () => {
  const s = setup(); const b = await s.buyer();
  const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  const p = s.pay(order); const n = s.calls.length;
  assert.equal((await s.webhook(p, { 'x-signature': 'ts=1,v1=' + '0'.repeat(64) })).status, 401);
  assert.equal(s.calls.length, n);
  assert.equal((await s.webhook(p, {}, { type: 'payment', data: { id: '88888' } })).status, 400);
  assert.equal(s.calls.length, n);
  assert.equal((await s.call('POST', '/api/rift/mp/webhook', { body: { status: 'approved', payment_id: p.id } })).status, 401);
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 0);
});

test('MP: no entrega por importe, moneda, destinatario, modo o referencia incorrectos ni por un pago pendiente', async () => {
  for (const override of [{ transaction_amount: 1 }, { currency_id: 'USD' }, { collector_id: 666 }, { live_mode: true }, { external_reference: 'a'.repeat(32) }, { date_created: 'invalid' }, { date_last_updated: 'invalid' }, { status: 'pending' }]) {
    const s = setup(); const b = await s.buyer();
    const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'liv-aurora' } });
    await s.webhook(s.pay(order, override));
    assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 0, JSON.stringify(override));
  }
});

test('MP: aprobado se acredita una sola vez incluso con notificaciones concurrentes; no acredita un segundo pago del mismo pedido', async () => {
  const s = setup(); const b = await s.buyer();
  const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'liv-aurora' } });
  const p = s.pay(order);
  const results = await Promise.all([s.webhook(p), s.webhook(p), s.webhook(p)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200]);
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 1);
  const me = await s.call('GET', '/api/rift/me', { token: b.token });
  assert.equal(me.account.purchases[0].method, 'ars-mp');
  await s.webhook(s.pay(order, { id: '88888' }));
  assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 1);
  assert.equal((await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'liv-aurora' } })).status, 409);
});

test('MP: recuperación consulta API, está aislada por cuenta y sigue con nuevas ventas apagadas', async () => {
  const s = setup(); const b = await s.buyer(); const other = await s.buyer();
  const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  s.pay(order);
  assert.equal((await s.call('POST', '/api/rift/mp/sync', { token: other.token, body: { id: order.id } })).status, 404);
  assert.deepEqual((await s.call('GET', '/api/rift/mp/orders', { token: other.token })).orders, []);
  s.env.MP_ENABLED = 'false';
  const result = await s.call('POST', '/api/rift/mp/sync', { token: b.token, body: { id: order.id } });
  assert.equal(result.order.state, 'paid');
  const n = s.calls.length;
  await s.call('POST', '/api/rift/mp/sync', { token: b.token, body: { id: order.id } });
  assert.equal(s.calls.length, n, 'consultas limitadas');
});

test('MP: timeout al crear conserva el pedido, recupera la preferencia y nunca repite el POST', async () => {
  const s = setup(); const b = await s.buyer(); s.failPost();
  const attempt = () => s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  assert.equal((await attempt()).status, 503);
  const { order } = await attempt(); assert.equal(order.state, 'creating');
  const r = await s.call('POST', '/api/rift/mp/sync', { token: b.token, body: { id: order.id } });
  assert.equal(r.order.state, 'open');
  assert.equal(s.calls.filter((c) => c.method === 'POST').length, 1);
});

test('MP: reembolso o contracargo retira el derecho conservando auditoría; una aprobación vieja no lo reactiva', async () => {
  for (const status of ['refunded', 'charged_back', 'cancelled', 'partial']) {
    const s = setup(); const b = await s.buyer();
    const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
    const old = s.pay(order); await s.webhook(old);
    s.tick(); await s.webhook(s.pay(order, status === 'partial' ? { transaction_amount_refunded: 1 } : { status }));
    assert.equal((await s.call('GET', '/api/rift/me', { token: b.token })).account.purchases.length, 0);
    s.pay(order, old); await s.webhook(old);
    assert.equal((await s.call('GET', '/api/rift/me', { token: b.token })).account.purchases.length, 0);
    assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first()).n, 1);
    assert.equal((await s.env.DB.prepare('SELECT COUNT(*) AS n FROM mp_events').first()).n, 3);
  }
});

test('MP: un fallo de API conserva el pedido y no entrega el objeto', async () => {
  const s = setup(); const b = await s.buyer();
  const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  s.failGet();
  assert.equal((await s.call('POST', '/api/rift/mp/sync', { token: b.token, body: { id: order.id } })).status, 503);
  assert.equal((await s.call('GET', '/api/rift/mp/orders', { token: b.token })).orders[0].state, 'open');
  assert.equal((await s.call('GET', '/api/rift/me', { token: b.token })).account.purchases.length, 0);
});

test('MP: contracargo firmado consulta el caso y su pago; ignora el payment_id no firmado del cuerpo', async () => {
  const s = setup(); const b = await s.buyer();
  const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  await s.webhook(s.pay(order));
  s.tick(); s.pay(order, { status: 'charged_back' });
  const r = await s.webhook({ id: '77777' }, {}, { type: 'topic_chargebacks_wh', data: { id: '77777', payment_id: '66666' } });
  assert.equal(r.status, 200);
  assert.equal((await s.call('GET', '/api/rift/me', { token: b.token })).account.purchases.length, 0);
  assert.ok(s.calls.some((c) => c.path === '/v1/chargebacks/77777'));
  assert.ok(!s.calls.some((c) => c.path === '/v1/payments/66666'));
});

test('MP: una consulta pendiente antigua no quita una compra aprobada más reciente', async () => {
  const s = setup(); const b = await s.buyer();
  const { order } = await s.call('POST', '/api/rift/mp/order', { token: b.token, body: { item: 'trail-magenta' } });
  const old = s.pay(order, { status: 'pending' });
  s.tick(); await s.webhook(s.pay(order));
  s.pay(order, old); await s.webhook(old);
  assert.equal((await s.call('GET', '/api/rift/me', { token: b.token })).account.purchases.length, 1);
});
