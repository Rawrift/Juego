// Estéticos de Rift Cargo: pinturas, estelas de motor, matrícula propia y cartel de la estación.
// Se pagan en la red principal de BNB Chain (USDT o BNB) directo a la wallet del creador, igual que
// el Pase Fundador. Solo cambian cómo se ve el juego: no dan ventaja ni se canjean por tokens.
//
// Cada pago lleva en la transacción una etiqueta con el artículo ("RCS:liv-aurora"), así un mismo
// pago no sirve para dos cosas y se puede restaurar en otro dispositivo con solo el hash.
// Este módulo no toca el navegador: lo usan el cliente y los tests.

import { FOUNDER, TRANSFER_TOPIC } from './founder.js';

export const STYLE_TAG = 'RCS:';

/** Pinturas. `usd` = se compra; `founder` = la regala ese nivel del Pase Fundador (1 a 3). */
export const LIVERIES = {
  rift: { usd: 0 },
  carbono: { usd: 2 },
  aurora: { usd: 2 },
  solar: { usd: 2 },
  fundador: { founder: 2 },
  prisma: { founder: 3 }
};
export const LIVERY_IDS = Object.keys(LIVERIES);

/** Colores de la llama de los motores. */
export const TRAILS = {
  cian: { usd: 0 },
  magenta: { usd: 1 },
  verde: { usd: 1 },
  violeta: { usd: 1 },
  dorado: { usd: 1, founder: 2 }
};
export const TRAIL_IDS = Object.keys(TRAILS);

/** Lo que se vende, con su precio en dólares. */
export const STYLE_ITEMS = {
  'liv-carbono': { usd: 2 },
  'liv-aurora': { usd: 2 },
  'liv-solar': { usd: 2 },
  'trail-magenta': { usd: 1 },
  'trail-verde': { usd: 1 },
  'trail-violeta': { usd: 1 },
  'trail-dorado': { usd: 1 },
  plates: { usd: 1 },
  sign: { usd: 2 },
  pack: { usd: 7 }
};
export const STYLE_ITEM_IDS = Object.keys(STYLE_ITEMS);
/** El pack trae todo lo demás (13 dólares sueltos). */
export const PACK_ITEMS = STYLE_ITEM_IDS.filter((id) => id !== 'pack');

/** Lo que regala cada nivel del Pase Fundador (acumulativo). */
export const FOUNDER_PERKS = [[], ['plates'], ['liv-fundador', 'trail-dorado'], ['liv-prisma']];

/** Artículos que tiene un jugador: los comprados (el pack se expande) más los de su nivel de Fundador. */
export function ownedSet(bought = [], founderRank = 0) {
  const set = new Set(['liv-rift', 'trail-cian']);
  for (const id of bought) {
    if (id === 'pack') PACK_ITEMS.forEach((x) => set.add(x));
    else set.add(id);
  }
  for (let r = 1; r <= Math.min(3, founderRank); r++) FOUNDER_PERKS[r].forEach((x) => set.add(x));
  return set;
}

/** Bytes de la etiqueta de un artículo, en hexadecimal sin "0x". */
export function styleTagHex(item) {
  return [...`${STYLE_TAG}${item}`].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const lower = (a) => String(a ?? '').toLowerCase();
const topicAddr = (topic) => `0x${lower(topic).slice(-40)}`;
/** Largo de una llamada transfer(to, amount) en hexadecimal: "0x" + selector + 2 argumentos. */
const TRANSFER_LEN = 2 + 8 + 64 * 2;

/** Datos de la transacción (ethers usa `data`; JSON-RPC, `input`). */
export function txData(tx) {
  return lower(tx?.data ?? tx?.input ?? '0x');
}

/** Lo que viene después de la llamada estándar (o null si no hay nada). */
export function extraData(tx) {
  const data = txData(tx);
  const rest = lower(tx?.to) === lower(FOUNDER.usdt) ? data.slice(TRANSFER_LEN) : data.slice(2);
  return rest.length ? rest : null;
}

function decodeTag(hex) {
  if (!hex || hex.length % 2 || hex.length > 80 || !/^[0-9a-f]+$/.test(hex)) return null;
  let s = '';
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  const m = /^RCS:([a-z-]+)$/.exec(s);
  return m && STYLE_ITEMS[m[1]] ? m[1] : null;
}

/**
 * Qué artículo prueba un pago ya minado. Devuelve { item, payer, usd, method } o { item: null, reason }.
 * `bnbUsd` = precio actual del BNB (para pagos en BNB).
 */
export function styleFromPayment({ tx, receipt, bnbUsd }) {
  if (!tx || !receipt) return { item: null, reason: 'pending' };
  const ok = receipt.status === 1 || receipt.status === '0x1' || receipt.status === 1n;
  if (!ok) return { item: null, reason: 'failed' };
  const item = decodeTag(extraData(tx));
  if (!item) return { item: null, reason: 'notStyle' };
  const price = STYLE_ITEMS[item].usd;
  const treasury = lower(FOUNDER.treasury);

  if (lower(tx.to) === lower(FOUNDER.usdt)) {
    let wei = 0n;
    let payer = null;
    for (const log of receipt.logs ?? []) {
      if (lower(log.address) !== lower(FOUNDER.usdt)) continue;
      const topics = log.topics ?? [];
      if (lower(topics[0]) !== TRANSFER_TOPIC || topicAddr(topics[2]) !== treasury) continue;
      wei += BigInt(log.data);
      payer = topicAddr(topics[1]);
    }
    if (!wei) return { item: null, reason: 'notToTreasury' };
    const usd = Number(wei / 10n ** 12n) / 1e6;
    return usd + 0.005 >= price ? { item, payer, usd, method: 'usdt' } : { item: null, reason: 'tooLow', usd };
  }
  if (lower(tx.to) === treasury) {
    const usd = (Number(BigInt(tx.value ?? 0) / 10n ** 12n) / 1e6) * bnbUsd;
    return usd / FOUNDER.bnbTolerance + 0.005 >= price
      ? { item, payer: lower(tx.from), usd, method: 'bnb' }
      : { item: null, reason: 'tooLow', usd };
  }
  return { item: null, reason: 'notToTreasury' };
}
