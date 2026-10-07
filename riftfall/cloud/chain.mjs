// Verifica en BNB Chain (red principal) un pago hecho al creador: Pase Fundador de RIFTFALL o
// estético de Rift Cargo. Usa las mismas reglas que el juego (src/shared), por JSON-RPC directo.

import { FOUNDER, founderFromPayment, bnbPriceFromReserves } from '../src/shared/founder.js';
import { styleFromPayment, extraData } from '../src/shared/cargo-style.js';
import { makeOrder, orderIdFromTx, paymentForOrder, ORDER_CONFIRMATIONS } from '../src/shared/purchase-order.js';

export function createChain({ rpcUrls = FOUNDER.rpcUrls, fetchImpl = fetch } = {}) {
  async function rpc(method, params) {
    let last = null;
    for (const url of rpcUrls) {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(15_000)
        });
        if (!res.ok) throw new Error('rpc');
        const body = await res.json();
        if (body.error) throw new Error(body.error.message ?? 'rpc');
        return body.result;
      } catch (err) {
        last = err;
      }
    }
    throw last ?? new Error('rpc');
  }

  async function price(block = 'latest') {
    const raw = await rpc('eth_call', [{ to: FOUNDER.priceFeed, data: '0x0902f1ac' }, block]);
    if (!/^0x[0-9a-fA-F]{192}$/.test(raw ?? '')) throw new Error('priceUnavailable');
    const value = bnbPriceFromReserves(BigInt(`0x${raw.slice(2, 66)}`), BigInt(`0x${raw.slice(66, 130)}`));
    if (!Number.isFinite(value) || value <= 0) throw new Error('priceUnavailable');
    return value;
  }

  return {
    async quote(details) {
      if (Number(BigInt(await rpc('eth_chainId', []))) !== FOUNDER.chainId) throw new Error('wrongChain');
      return makeOrder({ ...details, bnbUsd: details.method === 'bnb' ? await price() : undefined });
    },
    /**
     * Qué compra prueba una transacción: { kind: 'founder', item: tier } o { kind: 'style', item },
     * con payer, usd y method; o { kind: null, reason }.
     */
    async payment(hash, { findOrder = async () => null, review = false } = {}) {
      const [tx, receipt, head, chainId] = await Promise.all([
        rpc('eth_getTransactionByHash', [hash]),
        rpc('eth_getTransactionReceipt', [hash]),
        rpc('eth_blockNumber', []),
        rpc('eth_chainId', [])
      ]);
      if (Number(BigInt(chainId)) !== FOUNDER.chainId) return { kind: null, reason: 'wrongChain' };
      if (!tx) return { kind: null, reason: 'notFound' };
      if (!receipt?.blockNumber || !receipt.blockHash) return { kind: null, reason: 'pending' };
      if (![1, 1n, '0x1'].includes(receipt.status)) return { kind: null, reason: 'failed' };
      if (receipt.transactionHash?.toLowerCase() !== hash || (tx.hash && tx.hash.toLowerCase() !== hash)) return { kind: null, reason: 'notFound' };
      if (BigInt(head) - BigInt(receipt.blockNumber) + 1n < BigInt(ORDER_CONFIRMATIONS)) return { kind: null, reason: 'pending' };
      const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (!block || block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) return { kind: null, reason: 'pending' };
      const id = orderIdFromTx(tx);
      if (id) {
        const order = await findOrder(id);
        if (!order || (order.tx && order.tx !== hash)) return { kind: null, reason: 'badOrder' };
        const result = paymentForOrder({ order, tx, receipt, blockTime: Number(BigInt(block.timestamp)) * 1000 });
        if (review && order.method === 'bnb' && result.reason === 'orderExpired') {
          const checked = paymentForOrder({ order, tx, receipt, blockTime: Number(BigInt(block.timestamp)) * 1000, allowExpired: true });
          if (checked.kind) return { kind: 'manual', payer: order.payer, amountWei: order.wei,
            tagItem: order.kind === 'style' ? order.item : null, lockedKind: order.kind, lockedItem: order.item, orderId: id };
        }
        return result.kind ? { ...result, orderId: id } : result;
      }
      if (review) {
        if (String(tx.to).toLowerCase() !== FOUNDER.treasury.toLowerCase() || BigInt(tx.value ?? 0) <= 0n) return { kind: null, reason: 'notToTreasury' };
        let tagItem = null;
        if (extraData(tx)) {
          // Aquí solo se identifica la etiqueta; el dueño reconcilia el importe, no una cotización inventada.
          tagItem = styleFromPayment({ tx, receipt, bnbUsd: Number.MAX_SAFE_INTEGER }).item;
          if (!tagItem) return { kind: null, reason: 'otherItem' };
        }
        return { kind: 'manual', payer: String(tx.from).toLowerCase(), amountWei: BigInt(tx.value).toString(), tagItem };
      }
      // Los pagos antiguos no se recotizan con 'latest'. USDT es independiente del precio del BNB.
      let bnbUsd;
      if (String(tx.to).toLowerCase() !== FOUNDER.usdt.toLowerCase()) {
        try { bnbUsd = await price(receipt.blockNumber); }
        catch { return { kind: null, reason: 'manualReview' }; }
      }
      if (extraData(tx)) {
        const r = styleFromPayment({ tx, receipt, bnbUsd });
        return r.item ? { kind: 'style', item: r.item, payer: r.payer, usd: r.usd, method: r.method } : { kind: null, reason: r.reason };
      }
      const r = founderFromPayment({ tx, receipt, bnbUsd });
      return r.tier ? { kind: 'founder', item: r.tier, payer: r.payer, usd: r.usd, method: r.method } : { kind: null, reason: r.reason };
    }
  };
}
