// Ventanas de WalletConnect, las mismas en RIFTFALL y en Rift Cargo: "Conectá tu wallet" (en el celular
// se elige la app y se aprueba ahí; en la compu se escanea un código QR con el celular) y "Aprobá en tu
// wallet" (para firmar o pagar). En iPhone las apps solo se abren si el jugador toca un link de verdad,
// por eso todo son botones.

import './account.css';
import { isTouch, openInMetaMask } from './open-in-metamask.js';

/** Wallets con botón propio en el celular (las demás se conectan copiando el código). */
export const WALLETS = {
  metamask: { name: 'MetaMask', native: 'metamask://', universal: 'https://metamask.app.link/' },
  trust: { name: 'Trust Wallet', native: 'trust://', universal: 'https://link.trustwallet.com/' }
};

const T = {
  es: {
    title: 'Conectá tu wallet',
    text: 'Elegí tu wallet: se abre la app para que apruebes. Después volvé a esta pestaña.',
    pcText: 'Escaneá este código con la wallet de tu celular (MetaMask, Trust Wallet u otra) y aprobá ahí.',
    other: '¿Otra wallet? Copiá el código y pegalo en la app (opción WalletConnect):',
    copy: 'Copiar código',
    copied: 'Código copiado',
    alt: '¿No se abre MetaMask? Probá con este:',
    altBtn: 'MetaMask (otra forma)',
    inside: 'Si no funciona, abrí el juego dentro de MetaMask',
    install: '¿Preferís la extensión? Instalá MetaMask en este navegador',
    wait: 'Esperando tu wallet… Cuando apruebes, volvé a esta pestaña.',
    stuck: '¿No te apareció nada en la wallet? Fijate que la app esté actualizada y probá de nuevo. Si sigue sin andar, abrí el juego dentro de MetaMask.',
    apTitle: 'Aprobá en tu wallet',
    apText: 'Tocá el botón: se abre la app para que apruebes. Después volvé a esta pestaña.',
    apPc: 'Abrí la wallet en tu celular y aprobá el pedido.',
    apOpen: 'Abrir {name}',
    cancel: 'Cancelar'
  },
  en: {
    title: 'Connect your wallet',
    text: 'Pick your wallet: the app opens so you can approve. Then come back to this tab.',
    pcText: 'Scan this code with the wallet on your phone (MetaMask, Trust Wallet or another) and approve there.',
    other: 'Another wallet? Copy the code and paste it in the app (WalletConnect option):',
    copy: 'Copy code',
    copied: 'Code copied',
    alt: 'MetaMask does not open? Try this one:',
    altBtn: 'MetaMask (another way)',
    inside: 'If it does not work, open the game inside MetaMask',
    install: 'Prefer the extension? Install MetaMask in this browser',
    wait: 'Waiting for your wallet… Once you approve, come back to this tab.',
    stuck: 'Nothing showed up in your wallet? Make sure the app is up to date and try again. If it still fails, open the game inside MetaMask.',
    apTitle: 'Approve in your wallet',
    apText: 'Tap the button: the app opens so you can approve. Then come back to this tab.',
    apPc: 'Open the wallet on your phone and approve the request.',
    apOpen: 'Open {name}',
    cancel: 'Cancel'
  },
  pt: {
    title: 'Conecte sua carteira',
    text: 'Escolha sua carteira: o app abre para você aprovar. Depois volte para esta aba.',
    pcText: 'Escaneie este código com a carteira do seu celular (MetaMask, Trust Wallet ou outra) e aprove lá.',
    other: 'Outra carteira? Copie o código e cole no app (opção WalletConnect):',
    copy: 'Copiar código',
    copied: 'Código copiado',
    alt: 'O MetaMask não abre? Tente este:',
    altBtn: 'MetaMask (outro jeito)',
    inside: 'Se não funcionar, abra o jogo dentro do MetaMask',
    install: 'Prefere a extensão? Instale o MetaMask neste navegador',
    wait: 'Esperando sua carteira… Quando aprovar, volte para esta aba.',
    stuck: 'Não apareceu nada na carteira? Veja se o app está atualizado e tente de novo. Se continuar sem funcionar, abra o jogo dentro do MetaMask.',
    apTitle: 'Aprove na sua carteira',
    apText: 'Toque no botão: o app abre para você aprovar. Depois volte para esta aba.',
    apPc: 'Abra a carteira no seu celular e aprove o pedido.',
    apOpen: 'Abrir {name}',
    cancel: 'Cancelar'
  }
};

const pageLang = () => (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'es';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fox = '<span class="ra-mm-fox" aria-hidden="true">🦊</span>';

let box = null;

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
}

/**
 * Arma la ventana. Si el jugador toca un botón para abrir la app y vuelve a la pestaña sin respuesta,
 * a los pocos segundos se le dice qué probar. Devuelve el elemento.
 */
function mount(html, { onCancel, L, onClick = () => {} }) {
  closeWalletUI();
  const el = document.createElement('div');
  el.className = 'ra-overlay ra-mm';
  el.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true">${html}
    <button class="ra-btn ghost" data-mm="cancel">${L.cancel}</button></div>`;
  document.body.appendChild(el);
  box = el;
  let tapped = false;
  let stuck = null;
  const onBack = () => {
    if (document.visibilityState !== 'visible' || !tapped) return;
    clearTimeout(stuck);
    stuck = setTimeout(() => {
      if (el.isConnected) el.querySelector('[data-mm="msg"]').textContent = L.stuck;
    }, 8000);
  };
  document.addEventListener('visibilitychange', onBack);
  el.cleanup = () => {
    clearTimeout(stuck);
    document.removeEventListener('visibilitychange', onBack);
  };
  el.addEventListener('click', (ev) => {
    const app = ev.target.closest('[data-app]');
    if (app) {
      tapped = true;
      el.querySelector('[data-mm="msg"]').textContent = L.wait;
    }
    if (ev.target.closest('[data-mm="cancel"]')) {
      closeWalletUI();
      onCancel();
      return;
    }
    if (ev.target.closest('[data-mm="inside"]')) {
      closeWalletUI();
      onCancel();
      openInMetaMask(undefined, { lang: pageLang() });
      return;
    }
    onClick(ev, app);
  });
  return el;
}

/**
 * "Conectá tu wallet" con el código de WalletConnect (`uri`). En el celular, un botón por app (lleva el
 * código en el link); en la compu, el código QR. `onPick(id)` avisa qué app eligió el jugador (para
 * abrirla de nuevo cuando haya que firmar o pagar).
 */
export function showConnect(uri, { onCancel = () => {}, onPick = () => {}, lang = pageLang() } = {}) {
  const L = T[lang] ?? T.es;
  const enc = encodeURIComponent(uri);
  const mobile = isTouch();
  const apps = Object.entries(WALLETS)
    .map(([id, w], i) => `<a class="ra-btn ${i ? 'ghost' : 'primary'}" data-app="${id}" href="${w.native}wc?uri=${enc}">${esc(w.name)}</a>`)
    .join('');
  const html = `<header class="ra-head">${fox}<div><h2>${L.title}</h2><p data-mm="msg">${mobile ? L.text : L.pcText}</p></div></header>
    ${mobile
      ? `<div class="ra-mm-apps">${apps}</div>
        <p class="ra-note">${L.alt}</p>
        <a class="ra-btn ghost" data-app="metamask" href="${WALLETS.metamask.universal}wc?uri=${enc}">${L.altBtn}</a>`
      : '<div class="ra-mm-qr" data-mm="qr"></div>'}
    <p class="ra-note">${L.other}</p>
    <button class="ra-btn ghost" data-mm="copy">${L.copy}</button>
    ${mobile ? `<button class="ra-link ra-mm-inside" data-mm="inside">${L.inside}</button>` : `<a class="ra-link ra-mm-inside" href="https://metamask.io/download/" target="_blank" rel="noopener">${L.install}</a>`}`;
  const el = mount(html, {
    onCancel,
    L,
    onClick(ev, app) {
      if (app) onPick(app.dataset.app);
      const copy = ev.target.closest('[data-mm="copy"]');
      if (copy) copyText(uri).then(() => (copy.textContent = L.copied)).catch(() => {});
    }
  });
  if (!mobile) {
    import('uqr')
      .then(({ renderSVG }) => {
        const qr = el.querySelector('[data-mm="qr"]');
        if (qr) qr.innerHTML = renderSVG(uri, { border: 2 });
      })
      .catch(() => {});
  }
}

/**
 * "Aprobá en tu wallet" mientras se espera una firma o un pago. En el celular, el botón abre la app que
 * eligió el jugador (`appId`); en la compu, se aprueba en el celular.
 */
export function showApprove(appId, { onCancel = () => {}, lang = pageLang() } = {}) {
  const L = T[lang] ?? T.es;
  const w = isTouch() ? WALLETS[appId] ?? WALLETS.metamask : null;
  const html = `<header class="ra-head">${fox}<div><h2>${L.apTitle}</h2><p data-mm="msg">${w ? L.apText : L.apPc}</p></div></header>
    ${w ? `<a class="ra-btn primary" data-app="${appId ?? 'metamask'}" href="${w.native}">${L.apOpen.replace('{name}', esc(w.name))}</a>` : ''}`;
  mount(html, { onCancel, L });
}

export function closeWalletUI() {
  box?.cleanup?.();
  box?.remove();
  box = null;
}
