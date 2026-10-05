// Pase Fundador: apoyo al juego antes del lanzamiento, pagado en la red principal de BNB Chain
// directo a la wallet del creador (sin contratos intermedios). Todo lo que da es del juego
// (insignia, estela, pinturas, una nave reservada para el lanzamiento): no es una inversión.
//
// Este módulo no toca el navegador: decide qué nivel prueba una transacción ya minada.
// Lo usan el cliente (al comprar y al restaurar) y los tests.

export const FOUNDER = {
  chainId: 56,
  /** Wallet del creador: recibe los pagos. */
  treasury: '0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd',
  /** USDT (BEP-20) de BNB Chain, 18 decimales. */
  usdt: '0x55d398326f99059fF775485246999027B3197955',
  /** Par USDT/WBNB de PancakeSwap v2: da el precio del BNB sin depender de servicios externos. */
  priceFeed: '0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE',
  rpcUrls: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'],
  explorer: 'https://bscscan.com',
  /** Un pago en BNB vale si cubre al menos este % del precio (el BNB se mueve mientras se firma). */
  bnbTolerance: 0.9,
  tiers: [
    { id: 'pilot', usd: 3 },
    { id: 'gold', usd: 10 },
    { id: 'legend', usd: 25 }
  ]
};

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const lower = (a) => String(a ?? '').toLowerCase();
const topicAddr = (topic) => `0x${lower(topic).slice(-40)}`;

/** Nivel (0 = ninguno, 1..3) de un id de nivel. */
export function tierRank(id) {
  return FOUNDER.tiers.findIndex((t) => t.id === id) + 1;
}

/** El nivel más alto que cubre un monto en dólares (con margen para redondeos de centavos). */
export function tierForUsd(usd) {
  let best = null;
  for (const t of FOUNDER.tiers) if (usd + 0.005 >= t.usd) best = t.id;
  return best;
}

/** Precio del BNB en dólares a partir de las reservas del par USDT/WBNB (bigint). */
export function bnbPriceFromReserves(usdtReserve, wbnbReserve) {
  if (!wbnbReserve) return 0;
  // 6 decimales de precisión sin pasar por float con números gigantes.
  return Number((BigInt(usdtReserve) * 1_000_000n) / BigInt(wbnbReserve)) / 1_000_000;
}

/** Wei de BNB para pagar `usd` dólares al precio dado (redondeado hacia arriba a 1e-6 BNB). */
export function bnbWeiForUsd(usd, bnbUsd) {
  const micro = Math.ceil((usd / bnbUsd) * 1e6);
  return BigInt(micro) * 10n ** 12n;
}

/**
 * Qué nivel de Fundador prueba un pago ya minado.
 * `tx` y `receipt` con la forma de JSON-RPC o de ethers; `bnbUsd` = precio actual del BNB.
 * Devuelve { tier, payer, usd, method } o { tier: null, reason }.
 */
export function founderFromPayment({ tx, receipt, bnbUsd }) {
  if (!tx || !receipt) return { tier: null, reason: 'pending' };
  const ok = receipt.status === 1 || receipt.status === '0x1' || receipt.status === 1n;
  if (!ok) return { tier: null, reason: 'failed' };
  const treasury = lower(FOUNDER.treasury);

  // Pago en USDT: un evento Transfer del contrato de USDT hacia la tesorería.
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
    if (!wei) return { tier: null, reason: 'notToTreasury' };
    const usd = Number(wei / 10n ** 12n) / 1e6;
    const tier = tierForUsd(usd);
    return tier ? { tier, payer, usd, method: 'usdt' } : { tier: null, reason: 'tooLow', usd };
  }

  // Pago en BNB: transferencia directa a la tesorería.
  if (lower(tx.to) === treasury) {
    const wei = BigInt(tx.value ?? 0);
    const usd = (Number(wei / 10n ** 12n) / 1e6) * bnbUsd;
    const tier = tierForUsd(usd / FOUNDER.bnbTolerance);
    return tier ? { tier, payer: lower(tx.from), usd, method: 'bnb' } : { tier: null, reason: 'tooLow', usd };
  }
  return { tier: null, reason: 'notToTreasury' };
}

/** Datos de una llamada transfer(to, amount) de un token BEP-20. */
export function erc20TransferData(to, amountWei) {
  const addr = lower(to).replace(/^0x/, '').padStart(64, '0');
  const amt = BigInt(amountWei).toString(16).padStart(64, '0');
  return `0xa9059cbb${addr}${amt}`;
}
