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
    close: 'Cerrar'
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
    close: 'Close'
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
    close: 'Fechar'
  }
};

/** Celular o tablet (pantalla táctil). */
export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Link a esta misma página dentro de MetaMask (sin datos). */
const plainLink = () => `${APP_LINK}${location.host}${location.pathname}`;

let root = null;

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
export function openInMetaMask(makeLink = plainLink, { lang = 'es' } = {}) {
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
