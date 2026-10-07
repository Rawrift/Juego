import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { createChain } from '../../cloud/chain.mjs';
import { createApi } from '../../cloud/api.mjs';
import { createD1 } from '../../cloud/d1-node.mjs';
import { makeOrder, orderIdFromTx, paymentForOrder, ORDER_TTL, ORDER_LIMIT } from '../../src/shared/purchase-order.js';
import { FOUNDER, TRANSFER_TOPIC, erc20TransferData } from '../../src/shared/founder.js';

const PAYER = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'ab'.repeat(32)}`;
const BLOCK_HASH = `0x${'cd'.repeat(32)}`;
const AT = Date.UTC(2026, 9, 7, 15);
const pad = (s) => `0x${s.slice(2).padStart(64, '0')}`;
const template = (extra = {}) => makeOrder({ id: '12'.repeat(16), kind: 'founder', item: 'gold', method: 'bnb', payer: PAYER, now: AT, bnbUsd: 300, ...extra });
const proof = (order, extra = {}) => ({
  order, tx: { hash: HASH, to: order.to, from: order.payer, input: order.data, value: order.value },
  receipt: { status: '0x1', transactionHash: HASH, blockNumber: '0x3e6', blockHash: BLOCK_HASH, logs: [] },
  blockTime: AT + 1000, ...extra
});

function network() {
  const state = { price: 300, head: '0x3e8', chainId: '0x38', timestamp: AT + 1000, history: true, blocksMatch: true, transactions: new Map(), calls: [] };
  const fetchImpl = async (_url, options) => {
    const { method, params } = JSON.parse(options.body);
    state.calls.push({ method, params });
    let result;
    if (method === 'eth_chainId') result = state.chainId;
    else if (method === 'eth_blockNumber') result = state.head;
    else if (method === 'eth_getTransactionByHash') result = state.transactions.get(params[0])?.tx ?? null;
    else if (method === 'eth_getTransactionReceipt') result = state.transactions.get(params[0])?.receipt ?? null;
    else if (method === 'eth_getBlockByNumber') result = { hash: state.blocksMatch ? BLOCK_HASH : `0x${'ef'.repeat(32)}`, timestamp: `0x${Math.floor(state.timestamp / 1000).toString(16)}` };
    else if (method === 'eth_call') {
      if (params[1] !== 'latest' && !state.history) return Response.json({ error: { message: 'historical state unavailable' } });
      const words = [BigInt(Math.round(state.price * 1e6)) * 10n ** 12n, 10n ** 18n, 0n];
      result = `0x${words.map((w) => w.toString(16).padStart(64, '0')).join('')}`;
    } else throw new Error(`unexpected ${method}`);
    return Response.json({ result });
  };
  return { state, chain: createChain({ rpcUrls: ['https://rpc.invalid'], fetchImpl }) };
}

test('pedido: importe exacto, artículo y pagador; no acepta sustituciones ni pagos tardíos', () => {
  const order = template();
  assert.equal(orderIdFromTx(proof(order).tx), order.id);
  assert.equal(paymentForOrder(proof(order)).item, 'gold');
  assert.equal(paymentForOrder(proof(order, { tx: { ...proof(order).tx, value: '0x1' } })).reason, 'tooLow');
  assert.equal(paymentForOrder(proof(order, { tx: { ...proof(order).tx, from: FOUNDER.treasury } })).reason, 'otherPayer');
  assert.equal(paymentForOrder(proof(order, { tx: { ...proof(order).tx, input: '0x' } })).reason, 'badOrder');
  assert.equal(paymentForOrder(proof(order, { blockTime: AT + ORDER_TTL + 1000 })).reason, 'orderExpired');
  assert.equal(paymentForOrder(proof(order, { blockTime: AT - 60_000 })).reason, 'orderExpired');
});

test('pedido USDT: requiere el evento auténtico, remitente e importe; no usa la cotización BNB', async () => {
  const order = template({ method: 'usdt', kind: 'style', item: 'pack' });
  const p = proof(order);
  p.receipt.logs = [{ address: FOUNDER.usdt, topics: [TRANSFER_TOPIC, pad(PAYER), pad(FOUNDER.treasury)], data: `0x${BigInt(order.wei).toString(16)}` }];
  assert.equal(paymentForOrder(p).item, 'pack');
  assert.equal(paymentForOrder({ ...p, receipt: { ...p.receipt, logs: [{ ...p.receipt.logs[0], address: PAYER }] } }).reason, 'tooLow');
  const { chain, state } = network();
  state.transactions.set(HASH, p);
  assert.equal((await chain.payment(HASH, { findOrder: async () => order })).item, 'pack');
  assert.equal(state.calls.some((x) => x.method === 'eth_call'), false);
});

test('BNB: la compra y el artículo no cambian con el precio ni dependen de un RPC histórico', async () => {
  const { chain, state } = network();
  const order = await chain.quote({ id: '34'.repeat(16), kind: 'founder', item: 'gold', method: 'bnb', payer: PAYER, now: AT });
  state.transactions.set(HASH, proof(order));
  state.history = false;
  for (const price of [50, 1000, 1500]) {
    state.price = price;
    const result = await chain.payment(HASH, { findOrder: async () => order });
    assert.equal(result.item, 'gold');
    assert.equal(result.usd, 10);
  }
  assert.equal(state.calls.filter((x) => x.method === 'eth_call').length, 1, 'solo se cotiza al crear el pedido');
});

for (const method of ['bnb', 'usdt']) test(`${method} tardío: revisión preserva el artículo del pedido y consume el pedido una sola vez`, async (t) => {
  const { call, state, me, link, details, DB, env } = await fixture(t);
  await link();
  const { order } = await call('POST', '/api/rift/purchase/order', me.token, { ...details, method });
  const received = proof(order);
  if (method === 'usdt') received.receipt.logs = [{ address: FOUNDER.usdt, topics: [TRANSFER_TOPIC, pad(order.payer), pad(FOUNDER.treasury)], data: `0x${BigInt(order.wei).toString(16)}` }];
  state.transactions.set(HASH, received);
  state.timestamp = order.expiresAt + 1000;
  assert.equal((await call('POST', '/api/rift/purchase', me.token, { tx: HASH })).error, 'orderExpired');
  const boss = Wallet.createRandom();
  env.ADMIN_WALLETS = boss.address;
  const owner = await call('POST', '/api/rift/guest', null, {});
  const nonce = await call('POST', '/api/rift/wallet/nonce', null, { address: boss.address });
  await call('POST', '/api/rift/wallet/login', owner.token, { id: nonce.id, signature: await boss.signMessage(nonce.message) });
  const body = { tx: HASH, kind: order.kind, item: order.item, amountWei: order.wei, reason: 'Pago minado tarde revisado por el dueño' };
  assert.equal((await call('POST', '/api/rift/purchase/review/options', owner.token, { ...body, item: 'legend' })).error, 'otherItem');
  const options = await call('POST', '/api/rift/purchase/review/options', owner.token, body);
  assert.equal(options.status, 200);
  assert.equal((await call('POST', '/api/rift/purchase/review', owner.token, { id: options.id, signature: await boss.signMessage(options.message) })).status, 200);
  assert.equal((await DB.prepare('SELECT tx FROM purchase_orders WHERE id = ?').bind(order.id).first()).tx, HASH);
  const another = `0x${'98'.repeat(32)}`;
  const payment = structuredClone(received);
  payment.tx.hash = payment.receipt.transactionHash = another;
  state.transactions.set(another, payment);
  assert.equal((await call('POST', '/api/rift/purchase/review/options', owner.token, { ...body, tx: another })).error, 'badOrder');
});

test('red: exige mainnet, confirmaciones y un bloque canónico antes de dar derechos', async () => {
  const { chain, state } = network();
  const order = template();
  state.transactions.set(HASH, proof(order));
  state.head = '0x3e6';
  assert.equal((await chain.payment(HASH, { findOrder: async () => order })).reason, 'pending');
  state.head = '0x3e8';
  state.blocksMatch = false;
  assert.equal((await chain.payment(HASH, { findOrder: async () => order })).reason, 'pending');
  state.blocksMatch = true;
  state.chainId = '0x61';
  assert.equal((await chain.payment(HASH, { findOrder: async () => order })).reason, 'wrongChain');
});

test('pago BNB antiguo: cotización del bloque; sin archivo se deriva a revisión, nunca a latest', async () => {
  const { chain, state } = network();
  const p = proof(template());
  p.tx.input = '0x';
  state.transactions.set(HASH, p);
  assert.equal((await chain.payment(HASH)).item, 'gold');
  assert.equal(state.calls.find((x) => x.method === 'eth_call').params[1], '0x3e6');
  state.history = false;
  assert.equal((await chain.payment(HASH)).reason, 'manualReview');
});

test('pago USDT antiguo: se recupera aunque el proveedor no tenga cotización histórica', async () => {
  const { chain, state } = network();
  const order = template({ method: 'usdt' });
  const p = proof(order);
  p.tx.input = erc20TransferData(FOUNDER.treasury, BigInt(order.wei));
  p.receipt.logs = [{ address: FOUNDER.usdt, topics: [TRANSFER_TOPIC, pad(PAYER), pad(FOUNDER.treasury)], data: `0x${BigInt(order.wei).toString(16)}` }];
  state.transactions.set(HASH, p);
  state.history = false;
  assert.equal((await chain.payment(HASH)).item, 'gold');
  assert.equal(state.calls.some((x) => x.method === 'eth_call'), false);
});

async function fixture(t) {
  const { chain, state } = network();
  let now = AT;
  const DB = createD1();
  const env = {};
  t.after(() => DB.close());
  const api = createApi({ now: () => now, chain });
  const call = async (method, path, token, body) => {
    const response = await api.handle(new Request(`https://rift.test${path}`, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    }), { DB, ...env });
    return { status: response.status, ...await response.json() };
  };
  const wallet = Wallet.createRandom();
  const me = await call('POST', '/api/rift/guest', null, {});
  const link = async () => {
    const n = await call('POST', '/api/rift/wallet/nonce', null, { address: wallet.address });
    return call('POST', '/api/rift/wallet/login', me.token, { id: n.id, signature: await wallet.signMessage(n.message) });
  };
  const details = { kind: 'founder', item: 'gold', method: 'bnb', payer: wallet.address };
  return { call, state, me, link, details, wallet, DB, env, advance: (ms) => { now += ms; } };
}

test('API: pedido requiere wallet propia y restauración conserva los derechos y evita nuevas consultas', async (t) => {
  const { call, state, me, link, details, advance } = await fixture(t);
  assert.equal((await call('POST', '/api/rift/purchase/order', null, details)).status, 401);
  assert.equal((await call('POST', '/api/rift/purchase/order', me.token, details)).error, 'linkWallet');
  await link();
  assert.equal((await call('POST', '/api/rift/purchase/order', me.token, { ...details, item: '__proto__' })).error, 'badOrder');
  const { order } = await call('POST', '/api/rift/purchase/order', me.token, details);
  state.transactions.set(HASH, proof(order));
  const results = await Promise.all([1, 2].map(() => call('POST', '/api/rift/purchase', me.token, { tx: HASH })));
  assert.deepEqual(results.map((x) => x.status), [200, 200]);
  assert.equal(results[1].account.purchases.length, 1);
  advance(30 * 86_400_000);
  state.price = 50;
  state.history = false;
  const count = state.calls.length;
  const restored = await call('POST', '/api/rift/purchase', me.token, { tx: HASH });
  assert.equal(restored.account.purchases[0].item, 'gold');
  assert.equal(state.calls.length, count);
  const other = await call('POST', '/api/rift/guest', null, {});
  assert.equal((await call('POST', '/api/rift/purchase', other.token, { tx: HASH })).error, 'claimed');
});

test('API: un pedido no da dos compras aunque dos transferencias se reclamen simultáneamente', async (t) => {
  const { call, state, me, link, details } = await fixture(t);
  await link();
  const { order } = await call('POST', '/api/rift/purchase/order', me.token, details);
  const otherHash = `0x${'98'.repeat(32)}`;
  state.transactions.set(HASH, proof(order));
  const second = proof(order);
  second.tx.hash = second.receipt.transactionHash = otherHash;
  state.transactions.set(otherHash, second);
  const results = await Promise.all([HASH, otherHash].map((tx) => call('POST', '/api/rift/purchase', me.token, { tx })));
  assert.equal(results.filter((x) => x.status === 200).length, 1);
  assert.equal((await call('GET', '/api/rift/me', me.token)).account.purchases.length, 1);
});

test('API: limita pedidos por día, no admite importe elegido por el cliente y permite recibir pagos minados a tiempo después del vencimiento', async (t) => {
  const { call, state, me, link, details, advance } = await fixture(t);
  await link();
  let order;
  for (let i = 0; i < ORDER_LIMIT; i++) {
    const response = await call('POST', '/api/rift/purchase/order', me.token, { ...details, wei: '1', usd: 0.01 });
    assert.equal(response.status, 200);
    assert.equal(response.order.usd, 10);
    order = response.order;
  }
  assert.equal((await call('POST', '/api/rift/purchase/order', me.token, details)).status, 429);
  state.transactions.set(HASH, proof(order));
  advance(ORDER_TTL + 60_000);
  assert.equal((await call('POST', '/api/rift/purchase', me.token, { tx: HASH })).status, 200);
});

test('reconciliación anterior: requiere dueño, comprobante real y firma específica; audita sin inventar ingresos', async (t) => {
  const { call, state, me, link, details, DB, env } = await fixture(t);
  await link();
  const order = template({ payer: details.payer.toLowerCase() });
  const p = proof(order);
  p.tx.input = '0x';
  state.transactions.set(HASH, p);
  state.history = false;
  const body = { tx: HASH, kind: 'founder', item: 'gold', amountWei: BigInt(p.tx.value).toString(), reason: 'Comprobante original de compra revisado por el dueño' };
  assert.equal((await call('POST', '/api/rift/purchase/review/options', me.token, body)).status, 404);
  const boss = Wallet.createRandom();
  env.ADMIN_WALLETS = boss.address;
  const owner = await call('POST', '/api/rift/guest', null, {});
  const nonce = await call('POST', '/api/rift/wallet/nonce', null, { address: boss.address });
  await call('POST', '/api/rift/wallet/login', owner.token, { id: nonce.id, signature: await boss.signMessage(nonce.message) });
  assert.equal((await call('POST', '/api/rift/purchase/review/options', owner.token, { ...body, amountWei: '1' })).error, 'badOrder');
  const options = await call('POST', '/api/rift/purchase/review/options', owner.token, body);
  assert.equal(options.status, 200);
  const signature = await boss.signMessage(options.message);
  const accepted = await call('POST', '/api/rift/purchase/review', owner.token, { id: options.id, signature });
  assert.equal(accepted.status, 200);
  assert.equal((await call('POST', '/api/rift/purchase/review', owner.token, { id: options.id, signature })).error, 'expired');
  const purchase = (await call('GET', '/api/rift/me', me.token)).account.purchases[0];
  assert.equal(purchase.item, 'gold');
  assert.equal(purchase.usd, null, 'reconciliar un derecho no inventa un ingreso USD');
  const audit = await DB.prepare('SELECT * FROM purchase_reviews WHERE tx = ?').bind(HASH).first();
  assert.equal(audit.admin_id, owner.account.player.id);
  assert.equal(audit.amount_wei, body.amountWei);
  assert.equal((await call('POST', '/api/rift/purchase/review/options', owner.token, body)).error, 'claimed');
});
