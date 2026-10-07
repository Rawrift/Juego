// "Pagar en pesos", la misma ventana en RIFTFALL y en Rift Cargo. El comprador pide el artículo, ve
// el importe, a dónde pagar y su código, y queda "en revisión" hasta que el dueño ve el pago y lo
// reconoce desde su panel (segunda ventana de este archivo). Hasta ese momento no hay beneficio.
//
// Si el servidor no tiene la configuración completa, nada de esto aparece: `fiatPrice` devuelve null.

import './account.css';
import { account, api, start, sessionToken } from './account.js';
import { walletProvider } from './wallet.js';
import { FIAT_HOSTS, fiatKey, fiatCodeLabel, parseFiatCode, parseFiatRef } from '../shared/fiat.js';

const T = {
  es: {
    pay: 'Pagar en pesos · {ars}',
    title: 'Pagar en pesos',
    sub: 'Pagás por fuera del juego y, cuando vemos el pago, {name} queda en tu cuenta.',
    protect: 'Antes de pagar, protegé tu cuenta con huella, Face ID o wallet. Así tu compra no se pierde si cambiás de celular.',
    protectBtn: 'Proteger mi cuenta',
    amount: 'Importe',
    code: 'Tu código',
    step1: '1. Pagá exactamente {ars}.',
    step2: '2. En el mensaje o concepto del pago escribí tu código.',
    step3: '3. Listo. Revisamos los pagos a mano: puede tardar unas horas.',
    open: 'Abrir el link de pago',
    alias: 'Alias',
    holder: 'Titular',
    copyCode: 'Copiar código',
    copyAlias: 'Copiar alias',
    copied: 'Copiado',
    pending: 'Pago en revisión',
    pendingSub: 'Todavía no está acreditado. Cuando lo esté, aparece solo en tu cuenta.',
    expired: 'Este pedido venció. Si ya pagaste, no hace falta hacer nada: se puede acreditar igual.',
    paid: 'Pago acreditado. Ya lo tenés en tu cuenta.',
    cancel: 'Cancelar pedido',
    cancelled: 'Pedido cancelado.',
    close: 'Cerrar',
    wait: 'Preparando…',
    legal: 'Es una compra de un objeto del juego. No es una inversión ni da ganancias.',
    err: {
      offline: 'Sin conexión con el servidor. Probá de nuevo.',
      tooManyOrders: 'Tenés demasiados pedidos abiertos. Cancelá uno o probá mañana.',
      owned: 'Eso ya lo tenés.',
      generic: 'No se pudo armar el pedido. Probá de nuevo.'
    },
    owner: {
      open: 'Pagos en pesos',
      title: 'Pagos en pesos',
      sub: 'Buscá el código en el mensaje del pago que te llegó. Cargá lo que cobraste y la referencia de tu app de cobros, y confirmá con una firma gratuita. No escribas nombres ni datos de la persona.',
      none: 'No hay pedidos pendientes.',
      list: 'Pedidos pendientes',
      late: 'vencido',
      code: 'Código del pedido',
      ars: 'Importe cobrado (pesos)',
      ref: 'Referencia del cobro (n.º de operación)',
      reason: 'Dónde viste el pago',
      submit: 'Reconocer pago',
      done: 'Pago reconocido. La compra ya está en la cuenta del jugador.',
      errors: {
        amount: 'El importe no coincide con el del pedido.',
        noOrder: 'No hay un pedido con ese código.',
        refUsed: 'Esa referencia ya se usó para otro pedido.',
        claimed: 'Ese pedido ya estaba acreditado.',
        cancelled: 'El jugador canceló ese pedido.',
        signature: 'La firma no es de la wallet del dueño.',
        noWallet: 'Conectá la wallet del dueño para firmar.',
        form: 'Revisá el código, el importe, la referencia y el motivo (al menos 10 letras).',
        generic: 'No se pudo reconocer el pago.'
      }
    }
  },
  en: {
    pay: 'Pay in pesos · {ars}',
    title: 'Pay in Argentine pesos',
    sub: 'You pay outside the game and, once we see the payment, {name} is added to your account.',
    protect: 'Before paying, protect your account with fingerprint, Face ID or a wallet, so your purchase is not lost if you change phones.',
    protectBtn: 'Protect my account',
    amount: 'Amount',
    code: 'Your code',
    step1: '1. Pay exactly {ars}.',
    step2: '2. Write your code in the payment message.',
    step3: '3. Done. Payments are checked by hand: it can take a few hours.',
    open: 'Open the payment link',
    alias: 'Alias',
    holder: 'Account holder',
    copyCode: 'Copy code',
    copyAlias: 'Copy alias',
    copied: 'Copied',
    pending: 'Payment under review',
    pendingSub: 'Not credited yet. When it is, it shows up in your account by itself.',
    expired: 'This order expired. If you already paid, you do not need to do anything: it can still be credited.',
    paid: 'Payment credited. It is in your account.',
    cancel: 'Cancel order',
    cancelled: 'Order cancelled.',
    close: 'Close',
    wait: 'Getting ready…',
    legal: 'This is a purchase of an in-game item. It is not an investment and pays no returns.',
    err: {
      offline: 'No server connection. Try again.',
      tooManyOrders: 'You have too many open orders. Cancel one or try tomorrow.',
      owned: 'You already have that.',
      generic: 'Could not create the order. Try again.'
    },
    owner: {
      open: 'Peso payments',
      title: 'Peso payments',
      sub: 'Find the code in the message of the payment you received. Enter what you collected and the reference from your payments app, and confirm with a free signature. Do not write names or personal data.',
      none: 'No pending orders.',
      list: 'Pending orders',
      late: 'expired',
      code: 'Order code',
      ars: 'Amount collected (pesos)',
      ref: 'Payment reference (operation no.)',
      reason: 'Where you saw the payment',
      submit: 'Recognize payment',
      done: 'Payment recognized. The purchase is in the player’s account.',
      errors: {
        amount: 'The amount does not match the order.',
        noOrder: 'There is no order with that code.',
        refUsed: 'That reference was already used for another order.',
        claimed: 'That order was already credited.',
        cancelled: 'The player cancelled that order.',
        signature: 'The signature is not from the owner wallet.',
        noWallet: 'Connect the owner wallet to sign.',
        form: 'Check the code, amount, reference and reason (at least 10 letters).',
        generic: 'Could not recognize the payment.'
      }
    }
  },
  pt: {
    pay: 'Pagar em pesos · {ars}',
    title: 'Pagar em pesos argentinos',
    sub: 'Você paga fora do jogo e, quando vemos o pagamento, {name} fica na sua conta.',
    protect: 'Antes de pagar, proteja sua conta com digital, Face ID ou carteira. Assim sua compra não se perde se você trocar de celular.',
    protectBtn: 'Proteger minha conta',
    amount: 'Valor',
    code: 'Seu código',
    step1: '1. Pague exatamente {ars}.',
    step2: '2. Na mensagem do pagamento, escreva seu código.',
    step3: '3. Pronto. Conferimos os pagamentos à mão: pode levar algumas horas.',
    open: 'Abrir o link de pagamento',
    alias: 'Alias',
    holder: 'Titular',
    copyCode: 'Copiar código',
    copyAlias: 'Copiar alias',
    copied: 'Copiado',
    pending: 'Pagamento em revisão',
    pendingSub: 'Ainda não foi creditado. Quando for, aparece sozinho na sua conta.',
    expired: 'Este pedido venceu. Se você já pagou, não precisa fazer nada: ainda pode ser creditado.',
    paid: 'Pagamento creditado. Já está na sua conta.',
    cancel: 'Cancelar pedido',
    cancelled: 'Pedido cancelado.',
    close: 'Fechar',
    wait: 'Preparando…',
    legal: 'É a compra de um item do jogo. Não é um investimento nem dá ganhos.',
    err: {
      offline: 'Sem conexão com o servidor. Tente de novo.',
      tooManyOrders: 'Você tem pedidos abertos demais. Cancele um ou tente amanhã.',
      owned: 'Você já tem isso.',
      generic: 'Não foi possível criar o pedido. Tente de novo.'
    },
    owner: {
      open: 'Pagamentos em pesos',
      title: 'Pagamentos em pesos',
      sub: 'Procure o código na mensagem do pagamento recebido. Informe o que você recebeu e a referência do seu app de cobrança, e confirme com uma assinatura gratuita. Não escreva nomes nem dados da pessoa.',
      none: 'Não há pedidos pendentes.',
      list: 'Pedidos pendentes',
      late: 'vencido',
      code: 'Código do pedido',
      ars: 'Valor recebido (pesos)',
      ref: 'Referência do pagamento (n.º da operação)',
      reason: 'Onde você viu o pagamento',
      submit: 'Reconhecer pagamento',
      done: 'Pagamento reconhecido. A compra já está na conta do jogador.',
      errors: {
        amount: 'O valor não coincide com o do pedido.',
        noOrder: 'Não há pedido com esse código.',
        refUsed: 'Essa referência já foi usada em outro pedido.',
        claimed: 'Esse pedido já estava creditado.',
        cancelled: 'O jogador cancelou esse pedido.',
        signature: 'A assinatura não é da carteira do dono.',
        noWallet: 'Conecte a carteira do dono para assinar.',
        form: 'Confira o código, o valor, a referência e o motivo (pelo menos 10 letras).',
        generic: 'Não foi possível reconhecer o pagamento.'
      }
    }
  }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
/** $ 4.500 */
export const fmtArs = (n) => `$ ${Number(n).toLocaleString('es-AR')}`;
const X = '<svg class="ra-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18 M6 6l12 12"/></svg>';

let config = { enabled: false, prices: {} };
let host = { lang: () => 'es', toast: () => {}, openAccount: () => {} };
let root = null;

/** Cada juego dice cómo avisar, en qué idioma y cómo abrir la ventana de la cuenta. */
export function configureFiat(h) {
  host = { ...host, ...h };
}

/** Trae la configuración del cobro en pesos (una vez). Sin servidor o sin configurar, queda apagado. */
export async function loadFiat() {
  try {
    const res = await fetch('/api/rift/fiat');
    const data = res.ok ? await res.json() : null;
    config = data?.enabled && safeTarget(data) ? data : { enabled: false, prices: {} };
  } catch {
    config = { enabled: false, prices: {} };
  }
  return config;
}

/** El link de cobro se vuelve a revisar acá: solo https y solo los sitios de cobro conocidos. */
function safeTarget(c) {
  if (c.payUrl) {
    try {
      const u = new URL(c.payUrl);
      return u.protocol === 'https:' && FIAT_HOSTS.includes(u.hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  return !!(c.alias && c.holder);
}

/** Precio en pesos de un artículo, o null si no se vende así (entonces el botón no va). */
export const fiatPrice = (kind, item) => (config.enabled ? config.prices?.[fiatKey(kind, item)] ?? null : null);
/** ¿Está configurado el cobro en pesos? (para mostrar la entrada del panel del dueño) */
export const fiatOn = () => !!config.enabled;
export const fiatLabel = (kind, item, lang = host.lang()) => {
  const ars = fiatPrice(kind, item);
  return ars ? fill((T[lang] ?? T.es).pay, { ars: fmtArs(ars) }) : null;
};

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

function mount(html, label) {
  root?.remove();
  root = document.createElement('div');
  root.className = 'ra-overlay ra-fiat';
  root.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
  document.body.appendChild(root);
  const box = root;
  box.addEventListener('click', (ev) => (ev.target === box || ev.target.closest('[data-fx="close"]')) && box.remove());
  box.addEventListener('keydown', (ev) => ev.key === 'Escape' && box.remove());
  box.querySelector('.ra-x')?.focus();
  return box;
}

const head = (title, sub, L) => `<header class="ra-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
  <button class="ra-x" data-fx="close" aria-label="${esc(L.close)}">${X}</button></header>`;

// ---------- Comprador ----------

/**
 * Abre la ventana para pagar `kind`/`item` en pesos. `name` es el nombre del artículo, ya traducido.
 * Si ya había un pedido abierto de ese artículo, muestra ese (no crea otro).
 */
export async function openFiatPay({ kind, item, name }) {
  const L = T[host.lang()] ?? T.es;
  const ars = fiatPrice(kind, item);
  if (!ars) return;
  const sub = fill(L.sub, { name });
  if (!sessionToken() && !(await start())) return host.toast(L.err.offline, 'err');
  if (account()?.player?.guest !== false) {
    const box = mount(`${head(L.title, sub, L)}<p class="ra-fiat-warn">${esc(L.protect)}</p>
      <button class="ra-btn primary" data-fx="protect">${esc(L.protectBtn)}</button>`, L.title);
    box.querySelector('[data-fx="protect"]').addEventListener('click', () => {
      box.remove();
      host.openAccount();
    });
    return;
  }
  const box = mount(`${head(L.title, sub, L)}<p class="ra-note">${esc(L.wait)}</p>`, L.title);
  let order;
  try {
    const mine = (await api('GET', '/api/rift/fiat/orders')).orders;
    order = mine.find((o) => o.kind === kind && o.item === item && o.status === 'pending' && !o.expired)
      ?? (await api('POST', '/api/rift/fiat/order', { kind, item })).order;
  } catch (err) {
    box.remove();
    return host.toast(L.err[err.code] ?? L.err.generic, 'err');
  }
  if (!box.isConnected) return;
  renderOrder(box, order, sub, L);
}

function renderOrder(box, order, sub, L) {
  const code = fiatCodeLabel(order.code);
  const amount = fmtArs(order.ars);
  const target = config.payUrl
    ? `<a class="ra-btn primary" href="${esc(config.payUrl)}" target="_blank" rel="noopener noreferrer">${esc(L.open)}</a>`
    : `<dl class="ra-fiat-data"><dt>${esc(L.alias)}</dt><dd>${esc(config.alias)}</dd><dt>${esc(L.holder)}</dt><dd>${esc(config.holder)}</dd></dl>
       <button class="ra-btn ghost" data-fx="copyAlias">${esc(L.copyAlias)}</button>`;
  const state = order.status === 'paid' ? `<p class="ra-fiat-state ok">${esc(L.paid)}</p>`
    : `<p class="ra-fiat-state"><b>${esc(L.pending)}</b><span>${esc(order.expired ? L.expired : L.pendingSub)}</span></p>`;
  box.querySelector('.ra-card').innerHTML = `${head(L.title, sub, L)}
    <dl class="ra-fiat-data big"><dt>${esc(L.amount)}</dt><dd>${esc(amount)}</dd><dt>${esc(L.code)}</dt><dd data-fx="code">${esc(code)}</dd></dl>
    <ol class="ra-fiat-steps"><li>${esc(fill(L.step1, { ars: amount }).replace(/^1\. /, ''))}</li><li>${esc(L.step2.replace(/^2\. /, ''))}</li><li>${esc(L.step3.replace(/^3\. /, ''))}</li></ol>
    ${target}
    <button class="ra-btn ghost" data-fx="copyCode">${esc(L.copyCode)}</button>
    ${state}
    ${order.status === 'pending' ? `<button class="ra-btn ghost sm" data-fx="cancel">${esc(L.cancel)}</button>` : ''}
    <p class="ra-note">${esc(L.legal)}</p>`;
  const copy = (sel, text) => {
    const btn = box.querySelector(sel);
    btn?.addEventListener('click', () => copyText(text).then(() => (btn.textContent = L.copied)).catch(() => {}));
  };
  copy('[data-fx="copyCode"]', code);
  copy('[data-fx="copyAlias"]', config.alias ?? '');
  const cancel = box.querySelector('[data-fx="cancel"]');
  cancel?.addEventListener('click', async () => {
    cancel.disabled = true;
    try {
      await api('POST', '/api/rift/fiat/cancel', { id: order.id });
      host.toast(L.cancelled, 'ok');
    } catch {
      /* ya no estaba pendiente */
    }
    box.remove();
  });
}

// ---------- Dueño ----------

export const fiatOwnerLabel = (lang = host.lang()) => (T[lang] ?? T.es).owner.open;

/** Ventana del dueño: pedidos pendientes y el formulario para reconocer un pago con su firma. */
export async function openFiatOwner({ itemName = (kind, item) => `${kind}/${item}` } = {}) {
  const base = T[host.lang()] ?? T.es;
  const L = base.owner;
  const box = mount(`${head(L.title, L.sub, base)}<p class="ra-note">${esc(base.wait)}</p>`, L.title);
  let orders = [];
  try {
    orders = (await api('GET', '/api/rift/fiat/pending')).orders;
  } catch {
    orders = [];
  }
  if (!box.isConnected) return;
  const date = (ms) => new Date(ms).toLocaleDateString(host.lang(), { day: 'numeric', month: 'short' });
  const rows = orders.map((o) => `<li><button type="button" data-fx="pick" data-code="${esc(o.code)}" data-ars="${o.ars}">
      <b>${esc(fiatCodeLabel(o.code))}</b><span>${esc(itemName(o.kind, o.item))} · ${esc(fmtArs(o.ars))} · ${esc(date(o.createdAt))}${o.expired ? ` · ${esc(L.late)}` : ''}</span></button></li>`).join('');
  box.querySelector('.ra-card').innerHTML = `${head(L.title, L.sub, base)}
    <h3 class="ra-h3">${esc(L.list)}</h3>
    ${orders.length ? `<ul class="ra-fiat-list">${rows}</ul>` : `<p class="ra-note">${esc(L.none)}</p>`}
    <label class="ra-label" for="fxCode">${esc(L.code)}</label><div class="ra-field"><input id="fxCode" maxlength="20" placeholder="RIFT-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" /></div>
    <label class="ra-label" for="fxArs">${esc(L.ars)}</label><div class="ra-field"><input id="fxArs" inputmode="numeric" maxlength="9" autocomplete="off" /></div>
    <label class="ra-label" for="fxRef">${esc(L.ref)}</label><div class="ra-field"><input id="fxRef" maxlength="40" autocomplete="off" /></div>
    <label class="ra-label" for="fxReason">${esc(L.reason)}</label><div class="ra-field"><input id="fxReason" maxlength="300" autocomplete="off" /></div>
    <button class="ra-btn primary" data-fx="submit">${esc(L.submit)}</button>`;
  const field = (id) => box.querySelector(`#${id}`);
  box.querySelectorAll('[data-fx="pick"]').forEach((b) => b.addEventListener('click', () => {
    field('fxCode').value = fiatCodeLabel(b.dataset.code);
    field('fxRef').focus();
  }));
  const submit = box.querySelector('[data-fx="submit"]');
  submit.addEventListener('click', async () => {
    const code = parseFiatCode(field('fxCode').value);
    const arsText = field('fxArs').value.trim().replace(/[.\s$]/g, '');
    const ref = parseFiatRef(field('fxRef').value);
    const reason = field('fxReason').value.trim();
    if (!code || !/^\d{3,8}$/.test(arsText) || !ref || reason.length < 10) return host.toast(L.errors.form, 'err');
    submit.disabled = true;
    try {
      const { id, message } = await api('POST', '/api/rift/fiat/review/options', { code, ars: Number(arsText), ref, reason });
      const provider = await walletProvider();
      if (!provider) throw Object.assign(new Error('noWallet'), { code: 'noWallet' });
      const [address] = await provider.request({ method: 'eth_requestAccounts' });
      const hex = [...new TextEncoder().encode(message)].map((x) => x.toString(16).padStart(2, '0')).join('');
      const signature = await provider.request({ method: 'personal_sign', params: [`0x${hex}`, address] });
      await api('POST', '/api/rift/fiat/review', { id, signature });
      host.toast(L.done, 'ok');
      box.remove();
    } catch (err) {
      host.toast(L.errors[err?.code === 'badOrder' ? 'form' : err?.code] ?? L.errors.generic, 'err');
      submit.disabled = false;
    }
  });
}
