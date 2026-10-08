import './account.css';
import { account, api, start, sessionToken, syncPurchases } from './account.js';
import { safeCheckoutUrl, MP_ITEM_NAMES } from '../shared/mp-checkout.js';

const T = {
  es: { pay: 'Pagar con Mercado Pago', history: 'Mis compras con Mercado Pago', protect: 'Antes de pagar, protegé tu cuenta con huella, Face ID o wallet para recuperar tu compra.', protectBtn: 'Proteger mi cuenta', seller: 'Responsable de la tienda', total: 'Precio final', open: 'Abrir Mercado Pago', pending: 'Esperando la confirmación de Mercado Pago. La entrega es automática cuando el pago se aprueba.', paid: 'Pago aprobado. El cosmético ya está en tu cuenta.', reversed: 'El pago fue devuelto o tuvo un contracargo. El cosmético de esa compra dejó de estar disponible.', failed: 'No se pudo preparar el cobro. Podés volver a intentarlo desde el Taller.', preparing: 'Estamos recuperando el cobro. No hagas otra compra de este artículo.', expired: 'Este enlace de pago venció. Consultá el estado antes de volver a pagar.', check: 'Consultar estado', close: 'Cerrar', empty: 'Todavía no tenés pedidos con Mercado Pago.', error: 'No pudimos consultar Mercado Pago. Conservamos tu pedido; volvé a consultar.', owned: 'Este cosmético ya está en tu cuenta.' },
  en: { pay: 'Pay with Mercado Pago', history: 'My Mercado Pago purchases', protect: 'Protect your account with a passkey or wallet before paying so you can recover your purchase.', protectBtn: 'Protect my account', seller: 'Store owner', total: 'Final price', open: 'Open Mercado Pago', pending: 'Waiting for Mercado Pago confirmation. Your cosmetic is delivered automatically when payment is approved.', paid: 'Payment approved. Your cosmetic is in your account.', reversed: 'This payment was refunded or charged back. Its cosmetic is no longer available.', failed: 'Checkout could not be prepared. You can try again from the Workshop.', preparing: 'Recovering your checkout. Do not buy this item again.', expired: 'This checkout link expired. Check payment status before paying again.', check: 'Check status', close: 'Close', empty: 'You have no Mercado Pago orders yet.', error: 'Mercado Pago could not be checked. Your order is saved; check again.', owned: 'This cosmetic is already in your account.' },
  pt: { pay: 'Pagar com Mercado Pago', history: 'Minhas compras com Mercado Pago', protect: 'Proteja sua conta com digital, Face ID ou carteira antes de pagar para recuperar sua compra.', protectBtn: 'Proteger minha conta', seller: 'Responsável pela loja', total: 'Preço final', open: 'Abrir Mercado Pago', pending: 'Aguardando confirmação do Mercado Pago. A entrega é automática quando o pagamento é aprovado.', paid: 'Pagamento aprovado. O cosmético está na sua conta.', reversed: 'O pagamento foi devolvido ou sofreu contestação. O cosmético desta compra não está mais disponível.', failed: 'Não foi possível preparar o pagamento. Tente novamente na Oficina.', preparing: 'Recuperando seu pagamento. Não compre este item novamente.', expired: 'Este link venceu. Consulte o estado antes de pagar novamente.', check: 'Consultar estado', close: 'Fechar', empty: 'Você ainda não tem pedidos com Mercado Pago.', error: 'Não foi possível consultar o Mercado Pago. Seu pedido foi salvo; consulte novamente.', owned: 'Este cosmético já está na sua conta.' }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const amount = (n) => `$ ${Number(n).toLocaleString('es-AR')} ARS`;
let config = { enabled: false, prices: {} };
let host = { lang: () => 'es', toast: () => {}, openAccount: () => {}, onPaid: () => {} };
let mine = [];
let ownerId = null;
let root;
const strings = () => T[host.lang()] ?? T.es;
export const configureMp = (h) => { host = { ...host, ...h }; };
export const mpOn = () => !!config.enabled;
export const mpHistoryLabel = (lang = host.lang()) => (T[lang] ?? T.es).history;
export const mpHasOrders = () => ownerId === account()?.player?.id && mine.length > 0;
export const mpLabel = (item, lang = host.lang()) => config.enabled && config.prices[`style:${item}`]
  ? `${(T[lang] ?? T.es).pay} · ${amount(config.prices[`style:${item}`])}` : null;

export async function refreshMp() {
  const player = account()?.player?.id;
  if (player !== ownerId) { mine = []; ownerId = player ?? null; }
  if (!player || !sessionToken()) return false;
  const before = JSON.stringify(mine);
  try {
    const data = await api('GET', '/api/rift/mp/orders');
    if (account()?.player?.id !== player) return false;
    mine = data.orders ?? [];
  } catch { return false; }
  return before !== JSON.stringify(mine);
}
export async function loadMp() {
  try {
    const res = await fetch('/api/rift/mp');
    config = res.ok ? await res.json() : { enabled: false, prices: {} };
  } catch { config = { enabled: false, prices: {} }; }
  const u = new URL(location.href);
  const order = u.searchParams.get('mp_order');
  if (/^[a-f0-9]{32}$/.test(order || '')) {
    // Parámetros de retorno son pistas para consultar, nunca prueba de que se pagó.
    for (const k of ['mp_order', 'collection_id', 'collection_status', 'payment_id', 'status', 'external_reference', 'payment_type', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id']) u.searchParams.delete(k);
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    await start();
    await refreshMp();
    const o = mine.find((o) => o.id === order);
    if (o) showOrder(o);
  }
  return config;
}
function mount(html) {
  root?.remove();
  root = document.createElement('div'); root.className = 'ra-overlay ra-mp';
  root.innerHTML = `<div class="ra-card" role="dialog" aria-modal="true" aria-label="Mercado Pago">${html}</div>`;
  document.body.appendChild(root);
  const box = root;
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-mp="close"]')) box.remove(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.remove(); });
  box.querySelector('button')?.focus();
  return box;
}
export async function openMpPay({ item, name }) {
  if (!mpLabel(item)) return;
  const L = strings();
  if (!sessionToken()) await start();
  if (account()?.player?.guest !== false) {
    const box = mount(`<h2>${esc(L.pay)}</h2><p>${esc(L.protect)}</p><button class="ra-btn primary" data-mp="protect">${esc(L.protectBtn)}</button><button class="ra-btn ghost" data-mp="close">${esc(L.close)}</button>`);
    box.querySelector('[data-mp="protect"]').onclick = () => { box.remove(); host.openAccount(); };
    return;
  }
  const player = account().player.id;
  try {
    const r = await api('POST', '/api/rift/mp/order', { item });
    if (account()?.player?.id === player) showOrder(r.order, name);
  } catch (e) { host.toast(e.code === 'owned' ? L.owned : L.error, 'err'); }
}
function showOrder(order, name = MP_ITEM_NAMES[order.item] ?? order.item) {
  const player = account()?.player?.id;
  const L = strings();
  const box = mount('');
  let busy = false;
  function render() {
    const final = ['paid', 'reversed', 'failed'].includes(order.state);
    const url = !order.expired && !final ? safeCheckoutUrl(order.checkoutUrl) : null;
    const message = final ? L[order.state] : order.expired ? L.expired : order.state === 'creating' ? L.preparing : L.pending;
    box.querySelector('.ra-card').innerHTML = `<h2>${esc(L.pay)}</h2><p>${esc(name)}</p>
      <dl class="ra-fiat-data big"><dt>${esc(L.total)}</dt><dd>${esc(amount(order.ars))}</dd></dl>
      ${config.holder ? `<p>${esc(L.seller)}: <b>${esc(config.holder)}</b></p>` : ''}
      ${url ? `<a class="ra-btn primary" data-mp="checkout" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(L.open)}</a>` : ''}
      <p class="ra-fiat-state" data-mp="state">${esc(message)}</p>
      <p class="ra-note">${esc(order.id)}</p>
      <button class="ra-btn ghost" data-mp="check">${esc(L.check)}</button>
      <button class="ra-btn ghost" data-mp="close">${esc(L.close)}</button>`;
    box.querySelector('[data-mp="check"]').onclick = () => check(true);
  }
  async function check(explicit = false) {
    if (busy || !box.isConnected) return;
    if (account()?.player?.id !== player) { box.remove(); return; }
    busy = true;
    try {
      const r = await api('POST', '/api/rift/mp/sync', { id: order.id });
      if (!box.isConnected || account()?.player?.id !== player) return;
      const changed = r.order.state !== order.state;
      order = r.order;
      if (changed || order.state === 'paid' || order.state === 'reversed') {
        await start();
        if (account()?.player?.id !== player) { box.remove(); return; }
        await syncPurchases(); host.onPaid?.(order);
      }
      render();
    } catch { if (explicit) host.toast(L.error, 'err'); }
    finally { busy = false; }
  }
  render(); check();
  const timer = setInterval(() => { if (!box.isConnected) clearInterval(timer); else check(); }, 8000);
}
export async function openMpHistory({ itemName = (s) => s } = {}) {
  const player = account()?.player?.id;
  await refreshMp();
  if (account()?.player?.id !== player) return;
  const L = strings();
  const box = mount(`<h2>${esc(L.history)}</h2>${mine.length ? mine.map((o) => `<button class="ra-btn ghost" data-mp-order="${esc(o.id)}">${esc(itemName(o.item))} · ${esc(amount(o.ars))}</button>`).join('') : `<p>${esc(L.empty)}</p>`}<button class="ra-btn ghost" data-mp="close">${esc(L.close)}</button>`);
  box.querySelectorAll('[data-mp-order]').forEach((b) => { b.onclick = () => { const o = mine.find((o) => o.id === b.dataset.mpOrder); if (o) showOrder(o, itemName(o.item)); }; });
}
