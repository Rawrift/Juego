import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUNDER,
  TRANSFER_TOPIC,
  tierForUsd,
  tierRank,
  bnbPriceFromReserves,
  bnbWeiForUsd,
  founderFromPayment,
  erc20TransferData
} from '../../src/shared/founder.js';

const PAYER = '0x1111111111111111111111111111111111111111';
const pad = (a) => `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
const usdtLog = (to, usd) => ({
  address: FOUNDER.usdt,
  topics: [TRANSFER_TOPIC, pad(PAYER), pad(to)],
  data: `0x${(BigInt(Math.round(usd * 1e6)) * 10n ** 12n).toString(16)}`
});

test('niveles del Pase Fundador por monto', () => {
  assert.equal(tierForUsd(2.99), null);
  assert.equal(tierForUsd(3), 'pilot');
  assert.equal(tierForUsd(9.999), 'gold', 'los centavos de redondeo no bajan el nivel');
  assert.equal(tierForUsd(24), 'gold');
  assert.equal(tierForUsd(100), 'legend');
  assert.deepEqual(['pilot', 'gold', 'legend', 'x'].map(tierRank), [1, 2, 3, 0]);
});

test('precio del BNB desde las reservas de PancakeSwap y monto a pagar', () => {
  // Reservas reales leídas de la red principal (USDT, WBNB): ~US$786,69 por BNB.
  const price = bnbPriceFromReserves(0x211360d5fbbe2c5488a60fn, 0xac3643a9055a22a35a3n);
  assert.ok(price > 786 && price < 787, String(price));
  const wei = bnbWeiForUsd(10, 800);
  assert.equal(wei, 12_500_000_000_000_000n, '10 / 800 = 0,0125 BNB');
  assert.equal(erc20TransferData(FOUNDER.treasury, 5n), `0xa9059cbb${pad(FOUNDER.treasury).slice(2)}${'5'.padStart(64, '0')}`);
});

test('verifica pagos en USDT: solo cuentan los que llegan a la tesorería', () => {
  const tx = { to: FOUNDER.usdt, from: PAYER, value: 0n };
  const ok = founderFromPayment({ tx, receipt: { status: 1, logs: [usdtLog(FOUNDER.treasury, 10)] }, bnbUsd: 800 });
  assert.deepEqual(ok, { tier: 'gold', payer: PAYER, usd: 10, method: 'usdt' });

  const other = founderFromPayment({ tx, receipt: { status: 1, logs: [usdtLog('0x2222222222222222222222222222222222222222', 25)] }, bnbUsd: 800 });
  assert.equal(other.tier, null);
  assert.equal(other.reason, 'notToTreasury');

  const failed = founderFromPayment({ tx, receipt: { status: 0, logs: [usdtLog(FOUNDER.treasury, 25)] }, bnbUsd: 800 });
  assert.equal(failed.reason, 'failed');
  assert.equal(founderFromPayment({ tx, receipt: null }).reason, 'pending');
  assert.equal(founderFromPayment({ tx, receipt: { status: 1, logs: [usdtLog(FOUNDER.treasury, 1)] }, bnbUsd: 800 }).reason, 'tooLow');

  // Un token falso que imita el evento Transfer no cuenta.
  const fake = { ...usdtLog(FOUNDER.treasury, 25), address: '0x3333333333333333333333333333333333333333' };
  assert.equal(founderFromPayment({ tx: { ...tx, to: fake.address }, receipt: { status: 1, logs: [fake] }, bnbUsd: 800 }).tier, null);
});

test('verifica pagos en BNB con margen por el movimiento del precio', () => {
  const pay = (bnb) => ({ to: FOUNDER.treasury, from: PAYER, value: BigInt(Math.round(bnb * 1e6)) * 10n ** 12n });
  const r = { status: 1, logs: [] };
  assert.equal(founderFromPayment({ tx: pay(25 / 800), receipt: r, bnbUsd: 800 }).tier, 'legend');
  // Pagó 10 USD en BNB y después el BNB bajó 8%: sigue siendo Oro.
  assert.equal(founderFromPayment({ tx: pay(10 / 800), receipt: r, bnbUsd: 736 }).tier, 'gold');
  // Si bajó 20%, ya no alcanza para Oro.
  assert.equal(founderFromPayment({ tx: pay(10 / 800), receipt: r, bnbUsd: 640 }).tier, 'pilot');
  assert.equal(founderFromPayment({ tx: { ...pay(1), to: PAYER }, receipt: r, bnbUsd: 800 }).reason, 'notToTreasury');
});
