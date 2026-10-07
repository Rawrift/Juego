// Taller de estilo de Rift Cargo en el navegador: qué estéticos tiene el jugador, la compra con la
// wallet (USDT o BNB en la red principal de BNB Chain, directo a la wallet del creador), la
// verificación del pago en la cadena y cómo llevar todo al navegador de MetaMask en el celular.
// Habla con la wallet y con la red por JSON-RPC directo (sin librerías) para que el juego cargue liviano.

import { FOUNDER, tierRank, bnbPriceFromReserves, bnbWeiForUsd } from '../shared/founder.js';
import { STYLE_ITEMS, ownedSet } from '../shared/cargo-style.js';
import { packData, unpackData } from '../shared/pack.js';
import { injected } from '../client/injected.js';
import { isAdmin } from '../rift/account.js';
import { walletProvider } from '../rift/wallet.js';
import { preparePurchase, confirmedPurchase } from '../rift/purchases.js';

const KEY = 'riftcargo.style';
const PARAM = 'rf';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* modo privado */
  }
}

/** { bought: [{ item, tx, payer, usd, method, at }], sign, pending: [hash] } */
export function loadStyle() {
  try {
    const raw = JSON.parse(read(KEY) ?? 'null');
    if (raw && Array.isArray(raw.bought)) {
      return {
        bought: raw.bought.filter((b) => STYLE_ITEMS[b?.item]),
        sign: String(raw.sign ?? ''),
        pending: Array.isArray(raw.pending) ? raw.pending.filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)) : []
      };
    }
  } catch {
    /* sin datos */
  }
  return { bought: [], sign: '', pending: [] };
}
function saveStyle(st) {
  write(KEY, JSON.stringify(st));
}

/** Nivel del Pase Fundador de RIFTFALL (0 a 3): mismo sitio, misma memoria del navegador. */
export function founderRank() {
  try {
    return tierRank(JSON.parse(read('riftfall.founder') ?? 'null')?.tier);
  } catch {
    return 0;
  }
}

export function owned() {
  // El dueño del juego tiene todos los estéticos.
  if (isAdmin()) return ownedSet(['pack', 'fleet'], 3);
  return ownedSet(loadStyle().bought.map((b) => b.item), founderRank());
}
export const has = (id) => owned().has(id);

/** Texto del cartel de la estación (solo si lo compró). */
export function signText() {
  return has('sign') ? loadStyle().sign : '';
}
export function setSign(text) {
  if (!has('sign')) return false;
  const st = loadStyle();
  st.sign = cleanSign(text);
  saveStyle(st);
  return true;
}

/** Nombres: mayúsculas, números, espacios y guiones (lo que se lee bien pintado). */
export const cleanPlate = (s) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
export const cleanSign = (s) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 &.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);

// ---------- Red (lectura) ----------

async function rpc(method, params = []) {
  let lastErr = null;
  for (const url of FOUNDER.rpcUrls) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctl.signal
      });
      clearTimeout(timer);
      const body = await res.json();
      if (body.error) throw new Error(body.error.message ?? 'rpc');
      return body.result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('rpc');
}

/** Precio del BNB en dólares, leído del par USDT/WBNB de PancakeSwap. */
export async function bnbPrice() {
  const raw = await rpc('eth_call', [{ to: FOUNDER.priceFeed, data: '0x0902f1ac' }, 'latest']);
  return bnbPriceFromReserves(BigInt(`0x${raw.slice(2, 66)}`), BigInt(`0x${raw.slice(66, 130)}`));
}

/** BNB (con 6 decimales) que cuesta un artículo al precio dado. */
export function bnbFor(item, price) {
  return Number(bnbWeiForUsd(STYLE_ITEMS[item].usd, price) / 10n ** 12n) / 1e6;
}

/** Error con un código que la interfaz traduce. */
const fail = (code) => Object.assign(new Error(code), { code });

/** Verifica un pago por su hash y, si es de un estético, lo guarda. Devuelve el registro. */
export async function verifyStylePayment(hash, expectPayer = null, options = {}) {
  hash = String(hash ?? '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw fail('badHash');
  const st = loadStyle();
  const p = await confirmedPurchase(hash, 'style', expectPayer, options);
  const rec = { item: p.item, tx: p.tx, payer: p.payer, usd: p.usd, method: p.method, at: p.at };
  const index = st.bought.findIndex((b) => b.tx.toLowerCase() === rec.tx.toLowerCase());
  if (index >= 0) st.bought[index] = rec;
  else st.bought.push(rec);
  st.pending = st.pending.filter((h) => h.toLowerCase() !== hash.toLowerCase());
  saveStyle(st);
  return rec;
}

function setPending(hash, on) {
  const st = loadStyle();
  st.pending = st.pending.filter((h) => h.toLowerCase() !== hash.toLowerCase());
  if (on) st.pending.push(hash);
  saveStyle(st);
}

/**
 * Pagos enviados que no se llegaron a confirmar (se cerró la página, se cortó la red): se vuelven a
 * verificar solos. Devuelve los registros que se confirmaron ahora.
 */
export async function retryPending() {
  const done = [];
  for (const hash of loadStyle().pending) {
    try {
      done.push(await verifyStylePayment(hash));
    } catch (err) {
      // Si la red dice que no es un pago válido, se deja de intentar; si todavía no aparece, se sigue.
      if (!['pending', 'notFound', 'offline', 'manualReview', 'priceUnavailable'].includes(err?.code) && err?.code) setPending(hash, false);
    }
  }
  return done;
}

// ---------- Compra con la wallet ----------

let busy = false;
export const styleBusy = () => busy;
/** ¿Hay una wallet en este navegador? */
export const hasWallet = () => !!injected();

async function ensureBsc(eth) {
  const chain = await eth.request({ method: 'eth_chainId' });
  if (Number(chain) === FOUNDER.chainId) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902 && code !== -32603) throw err;
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: '0x38',
        chainName: 'BNB Smart Chain',
        rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
        blockExplorerUrls: [FOUNDER.explorer],
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
      }]
    });
  }
}

async function waitReceipt(hash, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) return r;
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw fail('pending');
}

/**
 * Compra un estético. `method` = 'usdt' | 'bnb'. `onStage` informa el paso ('wallet' → firmando,
 * 'confirm' → esperando la red). Devuelve el registro verificado.
 */
export async function buyStyle(item, method, onStage = () => {}) {
  if (!STYLE_ITEMS[item]) throw fail('unknown');
  busy = true;
  try {
    // La wallet del navegador o, en Chrome o Safari del celular, la app de MetaMask.
    const eth = await walletProvider();
    if (!eth) throw fail('noWallet');
    const [from] = await eth.request({ method: 'eth_requestAccounts' });
    await ensureBsc(eth);
    const order = await preparePurchase('style', item, method, from, eth);
    const tx = { from, to: order.to, data: order.data, value: order.value, gas: method === 'usdt' ? '0x186a0' : '0x9c40' };
    onStage('wallet');
    const hash = await eth.request({ method: 'eth_sendTransaction', params: [tx] });
    setPending(hash, true);
    onStage('confirm');
    await waitReceipt(hash);
    return await verifyStylePayment(hash, from, { wait: true });
  } catch (err) {
    if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') throw fail('rejected');
    throw err;
  } finally {
    busy = false;
  }
}

// ---------- Llevar la partida al navegador de MetaMask (celular) ----------

// La sesión de la Cuenta Rift también: en MetaMask entrás a la misma cuenta.
const CARRY = ['riftcargo.save', 'riftcargo.style', 'riftcargo.lang', 'riftfall.founder', 'rift.session'];

/** Link que abre Rift Cargo dentro de la app de MetaMask con la partida y los estéticos. */
export async function metamaskLink() {
  let pack = '';
  try {
    const data = {};
    for (const k of CARRY) {
      const v = read(k);
      if (v != null) data[k] = v;
    }
    pack = await packData(data);
  } catch {
    pack = '';
  }
  return `https://metamask.app.link/dapp/${location.host}${location.pathname}${pack ? `?${PARAM}=${pack}` : ''}`;
}

const parse = (s) => {
  try {
    return JSON.parse(s ?? 'null');
  } catch {
    return null;
  }
};

/** Mezcla lo que vino en el link con lo de este navegador, sin perder nada de ninguno. */
export function applyCargoTransfer(data) {
  // Partida: queda la que más avanzó (más ganado en total).
  const theirs = parse(data['riftcargo.save']);
  const mine = parse(read('riftcargo.save'));
  const earned = (x) => x?.state?.stats?.earned ?? -1;
  if (theirs?.state && earned(theirs) >= earned(mine)) write('riftcargo.save', data['riftcargo.save']);
  // Estéticos: se suman las compras de los dos lados.
  const a = parse(data['riftcargo.style']);
  if (a && Array.isArray(a.bought)) {
    const st = loadStyle();
    for (const b of a.bought) if (STYLE_ITEMS[b?.item] && !st.bought.some((x) => x.tx === b.tx)) st.bought.push(b);
    for (const h of Array.isArray(a.pending) ? a.pending : []) if (/^0x[0-9a-fA-F]{64}$/.test(h) && !st.pending.includes(h)) st.pending.push(h);
    if (!st.sign && a.sign) st.sign = String(a.sign);
    saveStyle(st);
  }
  // Pase Fundador: queda el nivel más alto.
  const f = parse(data['riftfall.founder']);
  if (f && tierRank(f.tier) > tierRank(parse(read('riftfall.founder'))?.tier)) write('riftfall.founder', data['riftfall.founder']);
  if (data['riftcargo.lang'] && read('riftcargo.lang') == null) write('riftcargo.lang', data['riftcargo.lang']);
  if (/^[A-Za-z0-9_-]{20,100}$/.test(data['rift.session'] ?? '')) write('rift.session', data['rift.session']);
}

/** Si la página se abrió con datos en el link, los aplica y limpia la dirección. */
export async function receiveCargoTransfer() {
  const url = new URL(location.href);
  const text = url.searchParams.get(PARAM);
  if (!text) return false;
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    applyCargoTransfer(await unpackData(text));
    return true;
  } catch {
    return false;
  }
}
