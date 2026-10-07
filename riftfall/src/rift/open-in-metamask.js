// Ventana "Abrir en MetaMask", la misma en RIFTFALL y en Rift Cargo. En el celular la wallet vive
// dentro de la app de MetaMask, así que el juego se abre ahí (con la cuenta y el progreso en el link).
// En iPhone la app solo se abre si el jugador toca un link de verdad: si lo abre el código, iOS va a la
// página de MetaMask y de ahí a la App Store aunque la app esté instalada. Por eso es un botón.

import './account.css';

const APP_LINK = 'https://metamask.app.link/dapp/';

const T = {
  es: {
    title: 'Abrir en MetaMask',
    text: 'En el celular, la wallet funciona dentro de la app de MetaMask. Tocá el botón y el juego se abre ahí, con tu cuenta y tu progreso.',
    open: 'Abrir en MetaMask',
    wait: 'Preparando…',
    alt: '¿Te manda a la App Store? Probá con este:',
    direct: 'Abrir la app directo',
    manual: 'O abrí MetaMask, entrá al navegador de la app y pegá el link:',
    copy: 'Copiar link',
    copied: 'Link copiado',
    pcTitle: 'Necesitás MetaMask',
    pcText: 'En la compu, instalá la extensión de MetaMask en este navegador y recargá la página.',
    install: 'Instalar MetaMask',
    close: 'Cerrar',
    apTitle: 'Aprobá en MetaMask',
    apText: 'Tocá el botón: se abre la app de MetaMask para que apruebes. Después volvé a esta pestaña y listo.',
    apOpen: 'Abrir MetaMask',
    apWait: 'Esperando a MetaMask… Cuando apruebes, volvé a esta pestaña.',
    apInside: 'Si no funciona, abrí el juego dentro de MetaMask',
    apAlt: '¿No aparece el pedido en MetaMask? Probá con este:',
    apAltBtn: 'Abrir MetaMask (otra forma)',
    apStuck: '¿No te apareció nada en MetaMask? Fijate que la app esté actualizada (App Store o Play Store) y probá "Abrir MetaMask (otra forma)". Si sigue sin andar, abrí el juego dentro de MetaMask: con hacerlo una vez la wallet queda en tu cuenta.',
    cancel: 'Cancelar'
  },
  en: {
    title: 'Open in MetaMask',
    text: 'On your phone, the wallet works inside the MetaMask app. Tap the button and the game opens there, with your account and progress.',
    open: 'Open in MetaMask',
    wait: 'Getting ready…',
    alt: 'Does it send you to the App Store? Try this one:',
    direct: 'Open the app directly',
    manual: 'Or open MetaMask, go to the in-app browser and paste the link:',
    copy: 'Copy link',
    copied: 'Link copied',
    pcTitle: 'You need MetaMask',
    pcText: 'On a computer, install the MetaMask extension in this browser and reload the page.',
    install: 'Install MetaMask',
    close: 'Close',
    apTitle: 'Approve in MetaMask',
    apText: 'Tap the button: the MetaMask app opens so you can approve. Then come back to this tab and you are done.',
    apOpen: 'Open MetaMask',
    apWait: 'Waiting for MetaMask… Once you approve, come back to this tab.',
    apInside: 'If it does not work, open the game inside MetaMask',
    apAlt: 'No request showing up in MetaMask? Try this one:',
    apAltBtn: 'Open MetaMask (another way)',
    apStuck: 'Nothing showed up in MetaMask? Make sure the app is up to date (App Store or Play Store) and try "Open MetaMask (another way)". If it still fails, open the game inside MetaMask: doing it once links the wallet to your account.',
    cancel: 'Cancel'
  },
  pt: {
    title: 'Abrir no MetaMask',
    text: 'No celular, a carteira funciona dentro do app do MetaMask. Toque no botão e o jogo abre lá, com sua conta e seu progresso.',
    open: 'Abrir no MetaMask',
    wait: 'Preparando…',
    alt: 'Ele manda para a App Store? Tente este:',
    direct: 'Abrir o app direto',
    manual: 'Ou abra o MetaMask, entre no navegador do app e cole o link:',
    copy: 'Copiar link',
    copied: 'Link copiado',
    pcTitle: 'Você precisa do MetaMask',
    pcText: 'No computador, instale a extensão do MetaMask neste navegador e recarregue a página.',
    install: 'Instalar MetaMask',
    close: 'Fechar',
    apTitle: 'Aprove no MetaMask',
    apText: 'Toque no botão: o app do MetaMask abre para você aprovar. Depois volte para esta aba e pronto.',
    apOpen: 'Abrir o MetaMask',
    apWait: 'Esperando o MetaMask… Quando aprovar, volte para esta aba.',
    apInside: 'Se não funcionar, abra o jogo dentro do MetaMask',
    apAlt: 'O pedido não aparece no MetaMask? Tente este:',
    apAltBtn: 'Abrir o MetaMask (outro jeito)',
    apStuck: 'Não apareceu nada no MetaMask? Veja se o app está atualizado (App Store ou Play Store) e tente "Abrir o MetaMask (outro jeito)". Se continuar sem funcionar, abra o jogo dentro do MetaMask: fazendo isso uma vez, a carteira fica na sua conta.',
    cancel: 'Cancelar'
  }
};

const pageLang = () => (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'es';

/** Celular o tablet (pantalla táctil). */
export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Link a esta misma página dentro de MetaMask (sin datos). */
const plainLink = () => `${APP_LINK}${location.host}${location.pathname}`;

let root = null;
/** Link "abrir el juego dentro de MetaMask" de este juego (con la cuenta y el progreso). */
let fallbackLink = null;
export function setWalletFallback(fn) {
  fallbackLink = fn;
}

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
 * Muestra la ventana. `makeLink()` arma (puede ser async) el link de MetaMask con los datos del
 * jugador; `lang` = 'es' | 'en' | 'pt'. En la compu, explica cómo instalar la extensión.
 */
export function openInMetaMask(makeLink = fallbackLink ?? plainLink, { lang = pageLang() } = {}) {
  const L = T[lang] ?? T.es;
  root?.remove();
  root = document.createElement('div');
  root.className = 'ra-overlay ra-mm';
  const mobile = isTouch();
  root.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="${mobile ? L.title : L.pcTitle}">
    <header class="ra-head"><span class="ra-mm-fox" aria-hidden="true">🦊</span><div><h2>${mobile ? L.title : L.pcTitle}</h2><p>${mobile ? L.text : L.pcText}</p></div>
      <button class="ra-x" data-mm="close" aria-label="${L.close}"><svg class="ra-ic" viewBox="0 0 24 24"><path d="M18 6 6 18 M6 6l12 12"/></svg></button></header>
    ${mobile ? `<a class="ra-btn primary ra-mm-open" data-mm="open" aria-disabled="true">${L.wait}</a>
    <p class="ra-note">${L.alt}</p>
    <a class="ra-btn ghost" data-mm="direct" aria-disabled="true">${L.direct}</a>
    <p class="ra-note">${L.manual}</p>
    <button class="ra-btn ghost" data-mm="copy" disabled>${L.copy}</button>`
    : `<a class="ra-btn primary" href="https://metamask.io/download/" target="_blank" rel="noopener">${L.install}</a>`}
  </div>`;
  document.body.appendChild(root);
  const box = root;
  let web = '';
  box.addEventListener('click', (ev) => {
    if (ev.target === box || ev.target.closest('[data-mm="close"]')) return box.remove();
    const a = ev.target.closest('a[aria-disabled="true"]');
    if (a) ev.preventDefault();
    const copy = ev.target.closest('[data-mm="copy"]');
    if (copy && web) copyText(web).then(() => (copy.textContent = L.copied)).catch(() => {});
  });
  box.addEventListener('keydown', (ev) => ev.key === 'Escape' && box.remove());
  box.querySelector('.ra-x').focus();
  if (!mobile) return;

  const ready = (link) => {
    if (!box.isConnected) return;
    const path = link.startsWith(APP_LINK) ? link.slice(APP_LINK.length) : `${location.host}${location.pathname}`;
    const open = box.querySelector('[data-mm="open"]');
    open.href = link;
    open.textContent = L.open;
    open.removeAttribute('aria-disabled');
    const direct = box.querySelector('[data-mm="direct"]');
    direct.href = `metamask://dapp/${path}`;
    direct.removeAttribute('aria-disabled');
    web = `https://${path}`;
    box.querySelector('[data-mm="copy"]').disabled = false;
  };
  Promise.resolve()
    .then(makeLink)
    .then((link) => ready(typeof link === 'string' && link.startsWith(APP_LINK) ? link : plainLink()))
    .catch(() => ready(plainLink()));
}

// ---------- "Aprobá en MetaMask" (Chrome o Safari en el celular, con MetaMask Connect) ----------

let approveBox = null;
/** Link universal (https://metamask.app.link/…) y directo a la app (metamask://…) del mismo pedido. */
const universal = (link) => (link.startsWith('metamask://') ? `https://metamask.app.link/${link.slice('metamask://'.length)}` : link);
const direct = (link) => (link.startsWith('https://metamask.app.link/') ? `metamask://${link.slice('https://metamask.app.link/'.length)}` : link);

/**
 * Muestra el botón para abrir MetaMask y aprobar un pedido (conectar, firmar o pagar). Lo llama
 * MetaMask Connect con el link de cada pedido; `onCancel` corta la espera.
 */
export function showApprove(link, { onCancel = () => {}, lang = pageLang() } = {}) {
  const L = T[lang] ?? T.es;
  approveBox?.remove();
  root?.remove();
  const box = document.createElement('div');
  approveBox = box;
  box.className = 'ra-overlay ra-mm';
  box.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="${L.apTitle}">
    <header class="ra-head"><span class="ra-mm-fox" aria-hidden="true">🦊</span><div><h2>${L.apTitle}</h2><p data-mm="msg">${L.apText}</p></div></header>
    <a class="ra-btn primary" data-mm="approve" href="${direct(link)}">${L.apOpen}</a>
    <p class="ra-note">${L.apAlt}</p>
    <a class="ra-btn ghost" data-mm="approve" href="${universal(link)}">${L.apAltBtn}</a>
    <button class="ra-link ra-mm-inside" data-mm="inside">${L.apInside}</button>
    <button class="ra-btn ghost" data-mm="cancel">${L.cancel}</button>
  </div>`;
  document.body.appendChild(box);
  // El pedido directo a la app es lo que usa MetaMask por defecto. Si el jugador vuelve a la pestaña y a
  // los pocos segundos el pedido sigue sin respuesta, se le dice qué probar.
  let tapped = false;
  let stuck = null;
  const onBack = () => {
    if (document.visibilityState !== 'visible' || !tapped) return;
    clearTimeout(stuck);
    stuck = setTimeout(() => {
      if (box.isConnected) box.querySelector('[data-mm="msg"]').textContent = L.apStuck;
    }, 8000);
  };
  document.addEventListener('visibilitychange', onBack);
  const observer = new MutationObserver(() => {
    if (box.isConnected) return;
    clearTimeout(stuck);
    document.removeEventListener('visibilitychange', onBack);
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true });
  box.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-mm="approve"]')) {
      tapped = true;
      box.querySelector('[data-mm="msg"]').textContent = L.apWait;
    }
    if (ev.target.closest('[data-mm="cancel"]')) {
      box.remove();
      onCancel();
    }
    if (ev.target.closest('[data-mm="inside"]')) {
      box.remove();
      onCancel();
      openInMetaMask(undefined, { lang });
    }
  });
}

export function closeApprove() {
  approveBox?.remove();
  approveBox = null;
}
