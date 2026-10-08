// Pago en pesos: el comprador le paga al dueño por fuera del juego (link de cobro o alias) y el dueño
// reconoce el pago a mano desde su panel, con una firma. Acá están las reglas que comparten el
// servidor, el navegador y los tests: qué se puede vender así, cómo se lee la configuración, el
// código del pedido y el mensaje que firma el dueño.
//
// Límites a propósito:
// - Los precios en pesos los fija el dueño, artículo por artículo. No hay conversión desde dólares.
// - Solo estéticos: nada de planos de naves ni de niveles del Pase que traen naves o prometen un NFT.
// - Sin configuración completa, esta forma de pago no existe (el botón no aparece).

import { PACK_ITEMS } from './cargo-style.js';

/** Lo único que se vende en pesos (lista cerrada). */
export const FIAT_ITEMS = {
  founder: ['pilot'],
  style: [...PACK_ITEMS, 'pack']
};

/** Sitios de cobro aceptados para el link. Cualquier otro se ignora. */
export const FIAT_HOSTS = ['cafecito.app', 'mpago.la', 'link.mercadopago.com.ar'];

export const FIAT_ORDER_TTL = 72 * 3_600_000;
/** Un pago puede llegar tarde: el dueño puede reconocer un pedido vencido hasta esta antigüedad. */
export const FIAT_REVIEW_WINDOW = 30 * 86_400_000;
export const FIAT_MAX_PENDING = 3;
export const FIAT_MAX_PER_DAY = 10;
export const FIAT_MIN_ARS = 100;
export const FIAT_MAX_ARS = 10_000_000;

export const fiatKey = (kind, item) => `${kind}:${item}`;
export const fiatSellable = (kind, item) => Array.isArray(FIAT_ITEMS[kind]) && FIAT_ITEMS[kind].includes(item);

function payUrl(raw) {
  try {
    const u = new URL(String(raw ?? '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    return FIAT_HOSTS.includes(u.hostname.toLowerCase()) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Configuración del cobro en pesos a partir de las variables del servidor:
 * FIAT_PAY_URL (link de cobro) o FIAT_ALIAS + FIAT_HOLDER (alias y titular), y FIAT_PRICES
 * (JSON `{ "founder:pilot": 4500, "style:trail-magenta": 1500 }`, pesos enteros).
 * Lo que esté mal escrito se ignora; si no queda destino de cobro o ningún precio, `enabled` es false.
 */
export function fiatConfig(env = {}) {
  const url = payUrl(env.FIAT_PAY_URL);
  const alias = /^[a-z0-9.-]{6,20}$/i.test(String(env.FIAT_ALIAS ?? '').trim()) ? String(env.FIAT_ALIAS).trim() : null;
  const holderRaw = String(env.FIAT_HOLDER ?? '').trim();
  const holder = /^[\p{L} .'-]{3,60}$/u.test(holderRaw) ? holderRaw : null;
  const prices = {};
  try {
    const raw = JSON.parse(String(env.FIAT_PRICES ?? '') || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, ars] of Object.entries(raw)) {
        const [kind, item, extra] = key.split(':');
        if (extra !== undefined || !fiatSellable(kind, item)) continue;
        if (Number.isInteger(ars) && ars >= FIAT_MIN_ARS && ars <= FIAT_MAX_ARS) prices[key] = ars;
      }
    }
  } catch {
    /* precios mal escritos: no se vende nada */
  }
  const byAlias = !url && alias && holder;
  const enabled = !!(url || byAlias) && Object.keys(prices).length > 0;
  if (!enabled) return { enabled: false, prices: {} };
  return { enabled: true, prices, ...(url ? { payUrl: url } : { alias, holder }) };
}

// Sin letras ni números que se confunden al copiarlos a mano (I, O, 0, 1).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código del pedido (50 bits al azar) a partir de 10 bytes aleatorios. */
export function fiatCode(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 10) throw new Error('bytes');
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[bytes[i] & 31];
  return s;
}

/** Como se le muestra al comprador: RIFT-ABCDE-FGHJK. */
export const fiatCodeLabel = (code) => `RIFT-${code.slice(0, 5)}-${code.slice(5)}`;

/** Lo que escriba el dueño (con o sin "RIFT-", guiones, espacios o minúsculas) → código, o null. */
export function parseFiatCode(text) {
  const s = String(text ?? '').toUpperCase().replace(/^\s*RIFT/, '').replace(/[^A-Z0-9]/g, '');
  return s.length === 10 && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

/** Referencia del cobro (el número de operación que ve el dueño en su app). */
export function parseFiatRef(text) {
  const s = String(text ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{3,39}$/.test(s) ? s.toLowerCase() : null;
}

/** Mensaje que firma el dueño para reconocer un pago: dice todo lo que queda registrado. */
export function fiatReviewMessage({ host, order, ref, reason, nonce }) {
  return [
    'Rift: reconocer un pago en pesos',
    `Sitio: ${host}`,
    `Pedido: ${order.id}`,
    `Código: ${fiatCodeLabel(order.code)}`,
    `Artículo: ${order.kind}/${order.item}`,
    `Importe: ARS ${order.ars}`,
    `Referencia del cobro: ${ref}`,
    `Motivo: ${reason}`,
    `Firma de un solo uso: ${nonce}`,
    '',
    'Solo registra un derecho en el juego. No mueve fondos.'
  ].join('\n');
}
