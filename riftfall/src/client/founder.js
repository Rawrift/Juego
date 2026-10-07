// Pase Fundador en el navegador: cotiza el BNB, pide el pago a la wallet del jugador (red
// principal de BNB Chain), espera la confirmación, lo verifica en la cadena y guarda los
// beneficios en este dispositivo. Para otro dispositivo basta el hash del pago.

import { BrowserProvider, JsonRpcProvider, FetchRequest } from 'ethers';
import { FOUNDER, tierRank, bnbPriceFromReserves, bnbWeiForUsd, founderFromPayment, erc20TransferData } from '../shared/founder.js';
import { t } from './i18n.js';
import { walletProvider } from '../rift/wallet.js';

const KEY = 'riftfall.founder';
const SKIN_KEY = 'riftfall.skin';

/** Pinturas que desbloquea cada nivel. */
export const SKIN_TIER = { original: 0, founder: 2, prisma: 3 };

let reader = null;
let busy = false;

/** true mientras hay una compra en curso (la wallet cambia de red y de cuenta). */
export function founderBusy() {
  return busy;
}
function readProvider() {
  if (!reader) {
    const req = new FetchRequest(FOUNDER.rpcUrls[0]);
    req.timeout = 15000;
    reader = new JsonRpcProvider(req, FOUNDER.chainId, { staticNetwork: true, batchMaxCount: 1 });
  }
  return reader;
}

export function loadFounder() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && tierRank(raw.tier)) return raw;
  } catch {
    /* sin datos */
  }
  return null;
}

/** 0 = no es Fundador, 1 = Piloto, 2 = Oro, 3 = Leyenda. */
export function founderRank() {
  return tierRank(loadFounder()?.tier);
}

function save(rec) {
  // Si ya tenía un nivel más alto, no se pisa.
  const prev = loadFounder();
  if (prev && tierRank(prev.tier) >= tierRank(rec.tier)) return prev;
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    /* modo privado */
  }
  return rec;
}

export function currentSkin() {
  let s = 'original';
  try {
    s = localStorage.getItem(SKIN_KEY) ?? 'original';
  } catch {
    /* sin almacenamiento */
  }
  return SKIN_TIER[s] !== undefined && founderRank() >= SKIN_TIER[s] ? s : 'original';
}

export function setSkin(s) {
  if (SKIN_TIER[s] === undefined || founderRank() < SKIN_TIER[s]) return false;
  try {
    localStorage.setItem(SKIN_KEY, s);
  } catch {
    /* sin almacenamiento */
  }
  return true;
}

/** Precio del BNB en dólares, leído del par USDT/WBNB de PancakeSwap. */
export async function bnbPrice() {
  const raw = await readProvider().call({ to: FOUNDER.priceFeed, data: '0x0902f1ac' });
  const r0 = BigInt(`0x${raw.slice(2, 66)}`);
  const r1 = BigInt(`0x${raw.slice(66, 130)}`);
  return bnbPriceFromReserves(r0, r1);
}

/** Verifica un pago por su hash y, si vale, guarda el nivel. */
export async function verifyPayment(hash, expectPayer = null) {
  hash = String(hash ?? '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error(t('f.badHash'));
  const p = readProvider();
  const [tx, receipt, price] = await Promise.all([p.getTransaction(hash), p.getTransactionReceipt(hash), bnbPrice()]);
  if (!tx) throw new Error(t('f.notFound'));
  const res = founderFromPayment({ tx, receipt, bnbUsd: price });
  if (!res.tier) throw new Error(t(`f.err.${res.reason}`));
  if (expectPayer && res.payer !== expectPayer.toLowerCase()) throw new Error(t('f.err.otherPayer'));
  return save({ tier: res.tier, tx: hash, payer: res.payer, method: res.method, usd: res.usd, at: Date.now() });
}

async function ensureMainnet(browser) {
  const net = await browser.getNetwork();
  if (Number(net.chainId) === FOUNDER.chainId) return;
  try {
    await browser.send('wallet_switchEthereumChain', [{ chainId: '0x38' }]);
  } catch (err) {
    const code = err?.error?.code ?? err?.code ?? err?.info?.error?.code;
    if (code !== 4902 && code !== -32603) throw err;
    await browser.send('wallet_addEthereumChain', [
      {
        chainId: '0x38',
        chainName: 'BNB Smart Chain',
        rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
        blockExplorerUrls: [FOUNDER.explorer],
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
      }
    ]);
  }
}

/**
 * Compra un nivel. `method` = 'usdt' | 'bnb'. `onStage` informa el paso actual
 * ('wallet' → firmando, 'confirm' → esperando la red).
 */
export async function buyFounder(tierId, method, onStage = () => {}) {
  const tier = FOUNDER.tiers.find((x) => x.id === tierId);
  if (!tier) throw new Error('nivel desconocido');
  // La wallet del navegador o, en Chrome o Safari del celular, la app de MetaMask.
  const eth = await walletProvider();
  if (!eth) throw new Error(t('err.noWallet'));
  busy = true;
  try {
    return await purchase(tier, method, onStage, eth);
  } finally {
    busy = false;
  }
}

async function purchase(tier, method, onStage, eth) {
  let browser = new BrowserProvider(eth, 'any');
  await browser.send('eth_requestAccounts', []);
  await ensureMainnet(browser);
  browser = new BrowserProvider(eth, 'any');
  const signer = await browser.getSigner();
  const from = await signer.getAddress();

  let req;
  if (method === 'usdt') {
    const amount = BigInt(Math.round(tier.usd * 1e6)) * 10n ** 12n;
    req = { to: FOUNDER.usdt, data: erc20TransferData(FOUNDER.treasury, amount), value: 0n, gasLimit: 90000n };
  } else {
    const price = await bnbPrice();
    req = { to: FOUNDER.treasury, value: bnbWeiForUsd(tier.usd, price), gasLimit: 30000n };
  }
  onStage('wallet');
  const hash = await signer.sendUncheckedTransaction(req);
  onStage('confirm');
  await readProvider().waitForTransaction(hash, 1, 180_000);
  return verifyPayment(hash, from);
}
