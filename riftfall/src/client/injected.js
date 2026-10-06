// La wallet del navegador. Con varias extensiones instaladas (MetaMask, Phantom, Coinbase…) todas
// pelean por window.ethereum y puede abrirse la equivocada; con EIP-6963 cada una se anuncia por su
// cuenta y se elige MetaMask si está. Sin anuncios se usa window.ethereum como siempre.

const announced = [];
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    if (e.detail?.provider && !announced.some((d) => d.provider === e.detail.provider)) announced.push(e.detail);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/** El proveedor EIP-1193 a usar, o null si no hay ninguna wallet en este navegador. */
export function injected() {
  const metamask = announced.find((d) => /^io\.metamask/.test(d.info?.rdns ?? ''));
  return metamask?.provider ?? window.ethereum ?? announced[0]?.provider ?? null;
}
