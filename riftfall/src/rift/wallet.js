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

// En el build de pruebas (`npm run build:e2e`) se puede simular WalletConnect; en producción no.
const fake = () => (import.meta.env.MODE === 'e2e' && typeof window !== 'undefined' ? window.__wcFake : null);

/** ¿Hay que conectar una wallet de otra app? (no hay wallet en este navegador y WalletConnect está listo) */
export const remoteWallet = () => !injected() && !!(PROJECT_ID || fake());

let upP = null;
/** Pedidos esperando que el jugador apruebe en su wallet (cada uno con su forma de cancelarlo). */
const pending = new Set();
const cancelAll = () => [...pending].forEach((stop) => stop());

function readApp() {
  try {
    return localStorage.getItem(APP_KEY);
  } catch {
    return null;
  }
}
function saveApp(id) {
  try {
    localStorage.setItem(APP_KEY, id);
  } catch {
    /* sin almacenamiento */
  }
}

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
  const accounts = up.session?.namespaces?.eip155?.accounts ?? [];
  const account = accounts.find((a) => a.startsWith(`${CHAIN}:`)) ?? accounts[0];
  if (!account) throw new Error('noAccount');
  return { up, address: account.split(':')[2].toLowerCase() };
}

/** Un pedido que se aprueba en la wallet (firmar, pagar): la ventana tiene el botón para abrir la app. */
function ask(up, method, params) {
  return waitFor(() => {
    showApprove(readApp(), { onCancel: cancelAll });
    return up.request({ method, params }, CHAIN);
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

/**
 * Proveedor EIP-1193 para pagar: la wallet del navegador o, si no hay, la conectada por WalletConnect
 * (siempre en BNB Chain). null si no hay forma de conectar una wallet.
 */
export async function walletProvider() {
  const local = injected();
  if (local) return local;
  if (!remoteWallet()) return null;
  const { up, address } = await session();
  return {
    isWalletConnect: true,
    async request({ method, params = [] }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return '0x38';
      if (method === 'net_version') return '56';
      // La sesión ya es en BNB Chain.
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      if (NEEDS_APPROVAL.test(method)) return ask(up, method, params);
      return up.request({ method, params }, CHAIN);
    },
    on() {},
    removeListener() {}
  };
}
