// La wallet en cualquier navegador. Con MetaMask en el navegador (la extensión en la compu o el
// navegador de la app de MetaMask) se usa esa. En Chrome o Safari del celular se conecta con la app de
// MetaMask por MetaMask Connect: el juego muestra un botón, se aprueba en MetaMask y se vuelve a la
// pestaña. La librería se carga solo cuando hace falta (no pesa para el resto de los jugadores).

import { injected } from '../client/injected.js';
import { FOUNDER } from '../shared/founder.js';
import { isTouch, showApprove, closeApprove } from './open-in-metamask.js';

const BSC = '0x38';
const BSC_TEST = '0x61';

/** ¿Hay que conectar con la app de MetaMask? (celular sin wallet en el navegador) */
export const remoteWallet = () => isTouch() && !injected();

let clientP = null;
/** Pedidos esperando que el jugador apruebe en la app (cada uno con su forma de cancelarlo). */
const pending = new Set();
const cancelAll = () => [...pending].forEach((stop) => stop());

// En el build de pruebas (`npm run build:e2e`) se puede simular la app de MetaMask; en producción no.
const fake = () => (import.meta.env.MODE === 'e2e' && typeof window !== 'undefined' ? window.__mmConnectFake : null);

function loadClient() {
  clientP ??= (fake() ? Promise.resolve({ createEVMClient: async (o) => fake()(o) }) : import('@metamask/connect-evm'))
    .then(({ createEVMClient }) =>
      createEVMClient({
        dapp: { name: 'Rift', url: location.origin, iconUrl: `${location.origin}/icons/icon-192.png` },
        api: {
          supportedNetworks: {
            [BSC]: FOUNDER.rpcUrls[0],
            [BSC_TEST]: 'https://bsc-testnet-rpc.publicnode.com',
            '0x1': 'https://ethereum-rpc.publicnode.com'
          }
        },
        analytics: { enabled: false },
        ui: { headless: true },
        skipAutoAnnounce: true,
        // En iPhone la app solo se abre si el jugador toca el link: en vez de abrirlo solo, el juego
        // muestra el botón.
        mobile: { preferredOpenLink: (link) => showApprove(link, { onCancel: cancelAll }) }
      })
    )
    .catch((err) => {
      clientP = null;
      throw err;
    });
  return clientP;
}

/**
 * Corre un pedido que el jugador aprueba en MetaMask: mientras espera se ve el botón para aprobar, y
 * la ventana se cierra cuando no queda ningún pedido pendiente.
 */
async function approve(fn) {
  const client = await loadClient();
  let stop;
  const stopped = new Promise((_, reject) => {
    stop = () => reject(Object.assign(new Error('cancelled'), { code: 4001 }));
  });
  pending.add(stop);
  try {
    return await Promise.race([fn(client), stopped]);
  } finally {
    pending.delete(stop);
    if (!pending.size) closeApprove();
  }
}

/** Pedidos que abren MetaMask para aprobar (los de lectura, como la red o un saldo, van directo). */
const NEEDS_APPROVAL = /^(eth_requestAccounts|eth_sendTransaction|eth_sign|personal_sign|wallet_)/;

/** Conecta y firma un mensaje en un solo paso (un solo viaje a la app). Devuelve { address, signature }. */
export async function remoteSign(message) {
  const r = await approve((c) => c.connectAndSign({ message, chainIds: [BSC] }));
  return { address: String(r.accounts[0]).toLowerCase(), signature: r.signature };
}

/**
 * Proveedor EIP-1193 para pagar o usar el token: la wallet del navegador o, en el celular, la app de
 * MetaMask (si hace falta, primero se conecta). null si no hay forma (compu sin MetaMask).
 */
export async function walletProvider() {
  const local = injected();
  if (local) return local;
  if (!isTouch()) return null;
  const client = await loadClient();
  if (client.status !== 'connected') await approve((c) => c.connect({ chainIds: [BSC] }));
  const p = client.getProvider();
  return {
    isMetaMaskConnect: true,
    request: (args) => (NEEDS_APPROVAL.test(args?.method ?? '') ? approve(() => p.request(args)) : p.request(args)),
    on: (...a) => p.on?.(...a),
    removeListener: (...a) => p.removeListener?.(...a)
  };
}
