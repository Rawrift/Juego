// Un pedido fija artículo, red, pagador e importe antes de abrir la wallet.
// Su etiqueta une la transacción al pedido sin contratos ni aprobaciones de tokens.
import { FOUNDER, bnbWeiForUsd, erc20TransferData, TRANSFER_TOPIC } from './founder.js';
import { STYLE_ITEMS } from './cargo-style.js';

export const ORDER_TTL = 15 * 60_000;
export const ORDER_CONFIRMATIONS = 3;
export const ORDER_LIMIT = 20;
export const ORDER_TAG = 'RPO:';

export function orderUsd(kind, item) {
  if (kind === 'founder') return FOUNDER.tiers.find((x) => x.id === item)?.usd ?? null;
  if (kind === 'style') return Object.hasOwn(STYLE_ITEMS, item) ? STYLE_ITEMS[item].usd : null;
  return null;
}

export function orderIdFromTx(tx) {
  const raw = String(tx?.input ?? tx?.data ?? '0x').toLowerCase();
  const extra = String(tx?.to).toLowerCase() === FOUNDER.usdt.toLowerCase() ? raw.slice(138) : raw.slice(2);
  const prefix = [...ORDER_TAG].map((x) => x.charCodeAt(0).toString(16)).join('');
  return new RegExp(`^${prefix}([0-9a-f]{64})$`).exec(extra)?.[1]?.match(/../g)?.map((x) => String.fromCharCode(parseInt(x, 16))).join('')?.match(/^[0-9a-f]{32}$/)?.[0] ?? null;
}

export function makeOrder({ id, kind, item, method, payer, now, bnbUsd }) {
  const usd = orderUsd(kind, item);
  if (!/^[0-9a-f]{32}$/.test(id) || usd == null || !['bnb', 'usdt'].includes(method) || !/^0x[0-9a-f]{40}$/.test(payer)) throw new Error('badOrder');
  if (method === 'bnb' && (!Number.isFinite(bnbUsd) || bnbUsd <= 0)) throw new Error('priceUnavailable');
  const wei = method === 'bnb' ? bnbWeiForUsd(usd, bnbUsd) : BigInt(Math.round(usd * 1e6)) * 10n ** 12n;
  const tag = [...`${ORDER_TAG}${id}`].map((x) => x.charCodeAt(0).toString(16)).join('');
  return { id, kind, item, method, payer, usd, wei: wei.toString(), chainId: FOUNDER.chainId,
    createdAt: now, expiresAt: now + ORDER_TTL,
    to: method === 'bnb' ? FOUNDER.treasury : FOUNDER.usdt,
    data: method === 'bnb' ? `0x${tag}` : erc20TransferData(FOUNDER.treasury, wei) + tag,
    value: method === 'bnb' ? `0x${wei.toString(16)}` : '0x0' };
}

/** No consulta precios: comprueba la transferencia exacta y la fecha del bloque minado. */
export function paymentForOrder({ order, tx, receipt, blockTime, allowExpired = false }) {
  const no = (reason) => ({ kind: null, reason });
  if (!tx || !receipt) return no('pending');
  if (![1, 1n, '0x1'].includes(receipt.status)) return no('failed');
  if (orderIdFromTx(tx) !== order.id) return no('badOrder');
  if (String(tx.from).toLowerCase() !== order.payer) return no('otherPayer');
  if (String(tx.to).toLowerCase() !== order.to.toLowerCase()) return no('notToTreasury');
  if (String(tx.input ?? tx.data).toLowerCase() !== order.data.toLowerCase()) return no('badOrder');
  if (!Number.isFinite(blockTime) || blockTime < order.createdAt - 30_000 || (!allowExpired && blockTime > order.expiresAt)) return no('orderExpired');
  if (BigInt(tx.value ?? 0) !== BigInt(order.value)) return no('tooLow');
  if (order.method === 'usdt') {
    const topicAddress = (s) => `0x${String(s ?? '').toLowerCase().slice(-40)}`;
    const matches = (receipt.logs ?? []).filter((log) => String(log.address).toLowerCase() === FOUNDER.usdt.toLowerCase()
      && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && topicAddress(log.topics[1]) === order.payer
      && topicAddress(log.topics[2]) === FOUNDER.treasury.toLowerCase());
    if (matches.reduce((sum, log) => sum + BigInt(log.data), 0n) !== BigInt(order.wei)) return no('tooLow');
  }
  return { kind: order.kind, item: order.item, payer: order.payer, usd: order.usd, method: order.method };
}
