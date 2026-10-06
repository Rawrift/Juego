// Verifica en BNB Chain (red principal) un pago hecho al creador: Pase Fundador de RIFTFALL o
// estético de Rift Cargo. Usa las mismas reglas que el juego (src/shared), por JSON-RPC directo.

import { FOUNDER, founderFromPayment, bnbPriceFromReserves } from '../src/shared/founder.js';
import { styleFromPayment, extraData } from '../src/shared/cargo-style.js';

export function createChain({ rpcUrls = FOUNDER.rpcUrls, fetchImpl = fetch } = {}) {
  async function rpc(method, params) {
    let last = null;
    for (const url of rpcUrls) {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
        });
        const body = await res.json();
        if (body.error) throw new Error(body.error.message ?? 'rpc');
        return body.result;
      } catch (err) {
        last = err;
      }
    }
    throw last ?? new Error('rpc');
  }

  return {
    /**
     * Qué compra prueba una transacción: { kind: 'founder', item: tier } o { kind: 'style', item },
     * con payer, usd y method; o { kind: null, reason }.
     */
    async payment(hash) {
      const [tx, receipt, raw] = await Promise.all([
        rpc('eth_getTransactionByHash', [hash]),
        rpc('eth_getTransactionReceipt', [hash]),
        rpc('eth_call', [{ to: FOUNDER.priceFeed, data: '0x0902f1ac' }, 'latest'])
      ]);
      if (!tx) return { kind: null, reason: 'notFound' };
      const bnbUsd = bnbPriceFromReserves(BigInt(`0x${raw.slice(2, 66)}`), BigInt(`0x${raw.slice(66, 130)}`));
      if (extraData(tx)) {
        const r = styleFromPayment({ tx, receipt, bnbUsd });
        return r.item ? { kind: 'style', item: r.item, payer: r.payer, usd: r.usd, method: r.method } : { kind: null, reason: r.reason };
      }
      const r = founderFromPayment({ tx, receipt, bnbUsd });
      return r.tier ? { kind: 'founder', item: r.tier, payer: r.payer, usd: r.usd, method: r.method } : { kind: null, reason: r.reason };
    }
  };
}
