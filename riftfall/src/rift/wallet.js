// La wallet en cualquier navegador. Con una wallet en el navegador (la extensión de MetaMask en la compu o
// el navegador de la app de MetaMask) se usa esa. Si no, se conecta por WalletConnect: en Chrome o Safari
// del celular el jugador toca su wallet (MetaMask, Trust Wallet…), aprueba en la app y vuelve a la
// pestaña; en la compu escanea un código QR con el celular. WalletConnect guarda los mensajes mientras el
// navegador está en segundo plano, así que la respuesta llega al volver. Se carga solo cuando hace falta.

import { injected } from '../client/injected.js';
import { FOUNDER } from '../shared/founder.js';
import { showConnect, showApprove, closeWalletUI } from './wallet-ui.js';

/** Identificador público del proyecto en Reown (WalletConnect). Sin él no hay conexión con otras apps. */
const PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID ?? '';
const CHAIN = 'eip155:56';
const METHODS = ['personal_sign', 'eth_sendTransaction', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'];
const APP_KEY = 'rift.wcApp';
/** Marca de que este navegador tiene una conexión de WalletConnect (así no se carga la librería en vano). */
const SESSION_KEY = 'rift.wc';

// En el build de pruebas (`npm run build:e2e`) se puede simular WalletConnect; en producción no.
const fake = () => (import.meta.env.MODE === 'e2e' && typeof window !== 'undefined' ? window.__wcFake : null);

/** ¿Hay que conectar una wallet de otra app? (no hay wallet en este navegador y WalletConnect está listo) */
export const remoteWallet = () => !injected() && !!(PROJECT_ID || fake());

let upP = null;
/** Pedidos esperando que el jugador apruebe en su wallet (cada uno con su forma de cancelarlo). */
const pending = new Set();
const cancelAll = () => [...pending].forEach((stop) => stop());

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, v) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* sin almacenamiento */
  }
}
const readApp = () => read(APP_KEY);
const saveApp = (id) => write(APP_KEY, id);

function load() {
  upP ??= (fake()
    ? Promise.resolve(fake())
    : import('@walletconnect/universal-provider').then(({ UniversalProvider }) =>
        UniversalProvider.init({
          projectId: PROJECT_ID,
          telemetryEnabled: false,
          metadata: {
            name: 'Rift',
            description: 'RIFTFALL y Rift Cargo',
            url: location.origin,
            icons: [`${location.origin}/icons/icon-192.png`]
          }
        })
      ))
    .then((up) => {
      // El código para conectar: botones por app en el celular, QR en la compu.
      up.on('display_uri', (uri) => showConnect(uri, { onCancel: cancelAll, onPick: saveApp }));
      // Si el jugador desconecta el sitio desde su wallet, la próxima vez se pide conectar de nuevo.
      up.on('session_delete', () => write(SESSION_KEY, null));
      return up;
    })
    .catch((err) => {
      upP = null;
      throw err;
    });
  return upP;
}

const rejected = (err) => err?.code === 4001 || err?.code === 5000 || /reject|denied|declined|cancel/i.test(err?.message ?? '');

/**
 * Corre algo que el jugador aprueba en su wallet: mientras espera se ve la ventana, que se cierra
 * cuando no queda ningún pedido pendiente. Rechazar (o "Cancelar") da el error 4001.
 */
async function waitFor(fn) {
  let stop;
  const stopped = new Promise((_, reject) => {
    stop = () => reject(Object.assign(new Error('cancelled'), { code: 4001 }));
  });
  pending.add(stop);
  try {
    return await Promise.race([fn(), stopped]);
  } catch (err) {
    if (err?.message !== 'cancelled' && rejected(err)) throw Object.assign(new Error('rejected'), { code: 4001 });
    throw err;
  } finally {
    pending.delete(stop);
    if (!pending.size) closeWalletUI();
  }
}

/** La sesión de WalletConnect (si no hay, se pide conectar). Devuelve { up, address }. */
async function session() {
  const up = await load();
  if (!up.session) {
    await waitFor(() =>
      up.connect({
        optionalNamespaces: {
          eip155: { chains: [CHAIN], methods: METHODS, events: ['chainChanged', 'accountsChanged'], rpcMap: { 56: FOUNDER.rpcUrls[0] } }
        }
      })
    );
  }
  const address = addressOf(up);
  if (!address) throw new Error('noAccount');
  write(SESSION_KEY, '1');
  return { up, address };
}

const accountsOf = (up) => up.session?.namespaces?.eip155?.accounts ?? [];
function addressOf(up) {
  const accounts = accountsOf(up);
  const account = accounts.find((a) => a.startsWith(`${CHAIN}:`)) ?? accounts[0];
  return account ? account.split(':')[2].toLowerCase() : null;
}

/** Un pedido que se aprueba en la wallet (firmar, pagar): la ventana tiene el botón para abrir la app. */
function ask(up, method, params, chain = CHAIN) {
  return waitFor(() => {
    showApprove(readApp(), { onCancel: cancelAll });
    return up.request({ method, params }, chain);
  });
}

const utf8Hex = (s) => `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** Conecta la wallet (si hace falta) y devuelve su dirección en minúsculas. */
export async function remoteAddress() {
  return (await session()).address;
}

/** Firma un mensaje con la wallet conectada (gratis, no autoriza pagos). */
export async function remoteSign(message) {
  const { up, address } = await session();
  return { address, signature: await ask(up, 'personal_sign', [utf8Hex(message), address]) };
}

/** Pedidos que se aprueban en la wallet (los de lectura, como un saldo, van directo a la red). */
const NEEDS_APPROVAL = /^(eth_sendTransaction|eth_sign|personal_sign)/;

const NOT_APPROVED = {
  es: 'Tu wallet no tiene habilitada esta red para el juego. Agregala en la wallet y volvé a conectar.',
  en: 'Your wallet has not enabled this network for the game. Add it in your wallet and connect again.',
  pt: 'Sua carteira não habilitou esta rede para o jogo. Adicione-a na carteira e conecte de novo.'
};

/**
 * Proveedor EIP-1193 sobre la conexión de WalletConnect, fijo en la red `chainId` (por defecto BNB
 * Chain). Nunca manda un pago a otra red: si la wallet no aprobó esa red, avisa en vez de enviarlo.
 */
function wrap(up, address, chainId) {
  const chain = `eip155:${chainId}`;
  return {
    isWalletConnect: true,
    async request({ method, params = [] }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return `0x${chainId.toString(16)}`;
      if (method === 'net_version') return String(chainId);
      // La conexión ya es en esta red: no hay que cambiar nada en la wallet.
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      if (NEEDS_APPROVAL.test(method)) {
        if (!accountsOf(up).some((a) => a.startsWith(`${chain}:`))) {
          const lang = (typeof document !== 'undefined' && document.documentElement.lang) || 'es';
          throw Object.assign(new Error(NOT_APPROVED[lang] ?? NOT_APPROVED.es), { code: 4902 });
        }
        return ask(up, method, params, chain);
      }
      return up.request({ method, params }, chain);
    },
    on() {},
    removeListener() {}
  };
}

/**
 * Proveedor EIP-1193 para pagar o usar el token: la wallet del navegador o, si no hay, la conectada
 * por WalletConnect (si todavía no hay conexión, se pide). null si no hay forma de conectar una wallet.
 */
export async function walletProvider({ chainId = 56 } = {}) {
  const local = injected();
  if (local) return local;
  if (!remoteWallet()) return null;
  const { up, address } = await session();
  return wrap(up, address, chainId);
}

/** La conexión de WalletConnect que ya tenía este navegador, sin pedir nada (null si no hay). */
export async function connectedProvider({ chainId = 56 } = {}) {
  if (injected() || !remoteWallet() || !read(SESSION_KEY)) return null;
  try {
    const up = await load();
    const address = up.session && addressOf(up);
    return address ? wrap(up, address, chainId) : null;
  } catch {
    return null;
  }
}

/** Cierra la conexión de WalletConnect de este navegador (al cerrar la sesión de la cuenta). */
export async function disconnectRemote() {
  if (!read(SESSION_KEY)) return;
  write(SESSION_KEY, null);
  const up = await load().catch(() => null);
  await up?.disconnect?.().catch(() => {});
}
