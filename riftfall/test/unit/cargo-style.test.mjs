// Estéticos de Rift Cargo: cada pago lleva la etiqueta del artículo, se verifica en la cadena y no
// sirve para dos cosas (ni para el Pase Fundador).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOUNDER, TRANSFER_TOPIC, founderFromPayment, erc20TransferData } from '../../src/shared/founder.js';
import { STYLE_ITEMS, PACK_ITEMS, ownedSet, styleTagHex, styleFromPayment, extraData } from '../../src/shared/cargo-style.js';

const PAYER = '0x1111111111111111111111111111111111111111';
const pad = (a) => `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
const usdtWei = (usd) => BigInt(Math.round(usd * 1e6)) * 10n ** 12n;
const usdtLog = (to, usd) => ({ address: FOUNDER.usdt, topics: [TRANSFER_TOPIC, pad(PAYER), pad(to)], data: `0x${usdtWei(usd).toString(16)}` });
/** Pago en USDT como lo arma el juego: transfer(tesorería, monto) + etiqueta. */
const usdtTx = (item, usd) => ({ to: FOUNDER.usdt, from: PAYER, value: '0x0', input: erc20TransferData(FOUNDER.treasury, usdtWei(usd)) + (item ? styleTagHex(item) : '') });
const bnbTx = (item, bnb) => ({ to: FOUNDER.treasury, from: PAYER, value: `0x${(BigInt(Math.round(bnb * 1e6)) * 10n ** 12n).toString(16)}`, input: item ? `0x${styleTagHex(item)}` : '0x' });
const ok = (logs = []) => ({ status: '0x1', logs });

test('la etiqueta del artículo va después de la llamada transfer y se puede leer', () => {
  assert.equal(styleTagHex('sign'), Buffer.from('RCS:sign').toString('hex'));
  assert.equal(extraData(usdtTx('liv-aurora', 2)), Buffer.from('RCS:liv-aurora').toString('hex'));
  assert.equal(extraData(usdtTx(null, 2)), null);
  assert.equal(extraData(bnbTx('pack', 0.01)), Buffer.from('RCS:pack').toString('hex'));
  assert.equal(extraData(bnbTx(null, 0.01)), null);
});

test('pago en USDT con etiqueta: da el artículo si el monto alcanza y llega a la tesorería', () => {
  const res = styleFromPayment({ tx: usdtTx('liv-aurora', 2), receipt: ok([usdtLog(FOUNDER.treasury, 2)]), bnbUsd: 600 });
  assert.deepEqual(res, { item: 'liv-aurora', payer: PAYER, usd: 2, method: 'usdt' });
  assert.equal(styleFromPayment({ tx: usdtTx('pack', 2), receipt: ok([usdtLog(FOUNDER.treasury, 2)]), bnbUsd: 600 }).reason, 'tooLow');
  assert.equal(styleFromPayment({ tx: usdtTx('sign', 2), receipt: ok([usdtLog(PAYER, 2)]), bnbUsd: 600 }).reason, 'notToTreasury');
  assert.equal(styleFromPayment({ tx: usdtTx('sign', 2), receipt: { status: '0x0', logs: [] }, bnbUsd: 600 }).reason, 'failed');
  assert.equal(styleFromPayment({ tx: usdtTx('sign', 2), receipt: null }).reason, 'pending');
});

test('pago en BNB con etiqueta, con margen por el movimiento del precio', () => {
  assert.equal(styleFromPayment({ tx: bnbTx('pack', 7 / 600), receipt: ok(), bnbUsd: 600 }).item, 'pack');
  // Pagó 7 USD y después el BNB bajó 8%: sigue valiendo.
  assert.equal(styleFromPayment({ tx: bnbTx('pack', 7 / 600), receipt: ok(), bnbUsd: 552 }).item, 'pack');
  // Si bajó 20%, ya no alcanza.
  assert.equal(styleFromPayment({ tx: bnbTx('pack', 7 / 600), receipt: ok(), bnbUsd: 480 }).reason, 'tooLow');
  assert.equal(styleFromPayment({ tx: { ...bnbTx('pack', 1), to: PAYER }, receipt: ok(), bnbUsd: 600 }).reason, 'notToTreasury');
});

test('sin etiqueta, o con una etiqueta inventada, no es una compra de estéticos', () => {
  assert.equal(styleFromPayment({ tx: usdtTx(null, 25), receipt: ok([usdtLog(FOUNDER.treasury, 25)]), bnbUsd: 600 }).reason, 'notStyle');
  const fake = { ...bnbTx(null, 1), input: `0x${Buffer.from('RCS:liv-gratis').toString('hex')}` };
  assert.equal(styleFromPayment({ tx: fake, receipt: ok(), bnbUsd: 600 }).reason, 'notStyle');
});

test('un pago de estéticos no sirve como Pase Fundador (y el Pase sigue andando igual)', () => {
  const tagged = founderFromPayment({ tx: usdtTx('pack', 10), receipt: ok([usdtLog(FOUNDER.treasury, 10)]), bnbUsd: 600 });
  assert.equal(tagged.tier, null);
  assert.equal(tagged.reason, 'otherItem');
  assert.equal(founderFromPayment({ tx: bnbTx('pack', 0.02), receipt: ok(), bnbUsd: 600 }).reason, 'otherItem');
  // El pago del Pase (sin etiqueta) sigue valiendo.
  assert.equal(founderFromPayment({ tx: usdtTx(null, 10), receipt: ok([usdtLog(FOUNDER.treasury, 10)]), bnbUsd: 600 }).tier, 'gold');
  assert.equal(founderFromPayment({ tx: bnbTx(null, 25 / 600), receipt: ok(), bnbUsd: 600 }).tier, 'legend');
});

test('lo que tiene el jugador: lo de fábrica, lo comprado, el pack expandido y lo del Pase Fundador', () => {
  const none = ownedSet([], 0);
  assert.ok(none.has('liv-rift') && none.has('trail-cian'));
  assert.ok(!none.has('liv-aurora') && !none.has('plates'));
  const pack = ownedSet(['pack'], 0);
  for (const id of PACK_ITEMS) assert.ok(pack.has(id), id);
  assert.ok(!pack.has('liv-fundador'), 'la pintura dorada es solo para Fundadores');
  assert.ok(ownedSet([], 1).has('plates'));
  assert.ok(ownedSet([], 2).has('liv-fundador') && ownedSet([], 2).has('trail-dorado'));
  assert.ok(ownedSet([], 3).has('liv-prisma'));
  // El pack sale más barato que todo suelto.
  const loose = PACK_ITEMS.reduce((sum, id) => sum + STYLE_ITEMS[id].usd, 0);
  assert.ok(STYLE_ITEMS.pack.usd < loose);
});
