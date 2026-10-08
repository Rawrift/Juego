/** Únicos destinos externos que puede abrir el botón de Checkout Pro. */
export const MP_ITEM_NAMES = {
  'liv-carbono': 'Pintura Carbono', 'liv-aurora': 'Pintura Aurora', 'liv-solar': 'Pintura Solar',
  'trail-magenta': 'Estela Magenta', 'trail-verde': 'Estela Verde', 'trail-violeta': 'Estela Violeta',
  'trail-dorado': 'Estela Dorada', plates: 'Matrículas de nave', sign: 'Cartel de estación', pack: 'Pack de estilo'
};
export function safeCheckoutUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port
      && ['www.mercadopago.com.ar', 'www.mercadopago.com'].includes(u.hostname) ? u.toString() : null;
  } catch { return null; }
}
