// Checkout Pro vía Preferences API. Sin SDK en el navegador ni datos de tarjetas propios.
import { fiatConfig } from '../src/shared/fiat.js';
import { safeCheckoutUrl, MP_ITEM_NAMES } from '../src/shared/mp-checkout.js';
export { safeCheckoutUrl } from '../src/shared/mp-checkout.js';

export class MercadoPagoError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new MercadoPagoError(status, code); };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const id = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const PAYMENT_ID = /^\d{1,30}$/;
const ORDER_ID = /^[a-f0-9]{32}$/;
const SITE = 'https://riftfall.duckdns.org';
const TTL = 72 * 3600000;

export function mercadoPagoConfig(env = {}) {
  const prices = fiatConfig({ FIAT_ALIAS: 'rift.auto', FIAT_HOLDER: 'Rift', FIAT_PRICES: env.MP_PRICES }).prices;
  const styles = Object.fromEntries(Object.entries(prices).filter(([k]) => k.startsWith('style:')));
  let site;
  try {
    const u = new URL(env.MP_SITE || SITE);
    if (u.protocol === 'https:' && !u.username && !u.password && !u.port && u.pathname === '/' && !u.search && !u.hash) site = u.origin;
  } catch { /* apagado */ }
  const live = env.MP_LIVE_MODE === 'true';
  const enabled = env.MP_ENABLED === 'true' && ['true', 'false'].includes(env.MP_LIVE_MODE)
    && typeof env.MP_ACCESS_TOKEN === 'string' && env.MP_ACCESS_TOKEN.length >= 10
    && typeof env.MP_WEBHOOK_SECRET === 'string' && env.MP_WEBHOOK_SECRET.length >= 16
    && PAYMENT_ID.test(String(env.MP_COLLECTOR_ID ?? '')) && site && Object.keys(styles).length > 0;
  return { enabled: !!enabled, prices: enabled ? styles : {}, site, live, collector: String(env.MP_COLLECTOR_ID ?? '') };
}

// La firma se calcula con el data.id de la URL, no con un id elegido en el cuerpo.
export async function verifyMpWebhook(request, secret) {
  const u = new URL(request.url);
  const dataId = u.searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id') || '';
  const parts = (request.headers.get('x-signature') || '').split(',').map((s) => s.trim().split('='));
  const timestamps = parts.filter(([k]) => k === 'ts');
  const signatures = parts.filter(([k]) => k === 'v1');
  if (u.searchParams.getAll('data.id').length !== 1 || !PAYMENT_ID.test(dataId || '')
    || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId) || timestamps.length !== 1 || signatures.length !== 1
    || !/^\d{1,13}$/.test(timestamps[0][1] || '') || !/^[a-f0-9]{64}$/.test(signatures[0][1] || '')) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(signatures[0][1].match(/../g), (s) => parseInt(s, 16));
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamps[0][1]};`;
  return await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(manifest)) ? dataId : null;
}

export const MP_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS mp_orders (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL,
    ars INTEGER NOT NULL, collector_id TEXT NOT NULL, live_mode INTEGER NOT NULL, created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'creating', preference_id TEXT, checkout_url TEXT,
    payment_id TEXT UNIQUE, checked_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS mp_orders_open_item ON mp_orders(player_id, kind, item) WHERE state IN ('creating','open')`,
  `CREATE INDEX IF NOT EXISTS mp_orders_player ON mp_orders(player_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS mp_payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0, amount_cents INTEGER NOT NULL, updated_at INTEGER NOT NULL, checked_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS mp_payments_order ON mp_payments(order_id)`,
  `CREATE TABLE IF NOT EXISTS mp_events (id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id TEXT NOT NULL,
    order_id TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL)`
];
function mpStore(db) {
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results ?? [];
  return {
    order: (id) => one('SELECT * FROM mp_orders WHERE id = ?', id),
    mine: (player) => all('SELECT * FROM mp_orders WHERE player_id = ? ORDER BY created_at DESC LIMIT 12', player),
    open: (player, item) => one("SELECT * FROM mp_orders WHERE player_id = ? AND kind = 'style' AND item = ? AND state IN ('creating','open')", player, item),
    async add(o) {
      const r = await run(`INSERT OR IGNORE INTO mp_orders (id,player_id,kind,item,ars,collector_id,live_mode,created_at,expires_at)
        SELECT ?,?,'style',?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mp_orders WHERE player_id = ? AND created_at > ?) < 10
        AND (SELECT COUNT(*) FROM mp_orders WHERE player_id = ? AND state IN ('creating','open')) < 3`,
      o.id, o.player, o.item, o.ars, o.collector, o.live ? 1 : 0, o.now, o.now + TTL, o.player, o.now - 86400000, o.player);
      return (r.meta?.changes ?? r.changes ?? 0) > 0;
    },
    attach: (order, preference, url) => run("UPDATE mp_orders SET preference_id = ?, checkout_url = ?, state = 'open' WHERE id = ? AND state = 'creating'", preference, url, order),
    failed: (order) => run("UPDATE mp_orders SET state = 'failed' WHERE id = ? AND state = 'creating'", order),
    // Un solo consultante por pedido cada 30 segundos. No limita las notificaciones auténticas.
    async claimCheck(order, now) {
      const r = await run('UPDATE mp_orders SET checked_at = ? WHERE id = ? AND checked_at < ?', now, order, now - 30000);
      return (r.meta?.changes ?? r.changes ?? 0) > 0;
    },
    async apply(order, payment, now) {
      const status = payment.status;
      const approved = status === 'approved' && Number(payment.transaction_amount_refunded ?? payment.amount_refunded ?? 0) === 0;
      // Una devolución/contracargo no vuelve a aprobarse por una respuesta vieja concurrente.
      const terminal = ['refunded', 'charged_back', 'cancelled'].includes(status) || Number(payment.transaction_amount_refunded ?? payment.amount_refunded ?? 0) > 0;
      const state = terminal ? 'reversed' : status;
      const tx = `mp:${payment.id}`;
      await db.batch([
        db.prepare(`INSERT INTO mp_payments (id,order_id,status,active,amount_cents,updated_at,checked_at) VALUES (?,?,?,0,?,?,?)
          ON CONFLICT(id) DO UPDATE SET status = CASE WHEN mp_payments.status = 'reversed' THEN 'reversed' ELSE excluded.status END,
          updated_at = excluded.updated_at, checked_at = MAX(mp_payments.checked_at,excluded.checked_at)
          WHERE mp_payments.order_id = excluded.order_id AND mp_payments.updated_at <= excluded.updated_at`)
          .bind(String(payment.id), order.id, state, order.ars * 100, Date.parse(payment.date_last_updated), now),
        db.prepare(`UPDATE mp_orders SET payment_id = ?, state = 'paid' WHERE id = ? AND payment_id IS NULL
          AND EXISTS (SELECT 1 FROM mp_payments WHERE id = ? AND order_id = ? AND status = 'approved') AND ? = 1`)
          .bind(String(payment.id), order.id, String(payment.id), order.id, approved ? 1 : 0),
        db.prepare(`UPDATE mp_payments SET active = CASE WHEN status = 'approved' AND EXISTS
          (SELECT 1 FROM mp_orders WHERE id = ? AND payment_id = mp_payments.id) THEN 1 ELSE 0 END WHERE id = ? AND order_id = ?`)
          .bind(order.id, String(payment.id), order.id),
        db.prepare(`INSERT OR IGNORE INTO purchases (tx,player_id,kind,item,usd,method,payer,at)
          SELECT ?,player_id,kind,item,NULL,'ars-mp',NULL,? FROM mp_orders WHERE id = ? AND EXISTS
          (SELECT 1 FROM mp_payments WHERE id = ? AND order_id = ? AND active = 1)`)
          .bind(tx, now, order.id, String(payment.id), order.id),
        db.prepare(`UPDATE mp_orders SET state = 'reversed' WHERE id = ? AND payment_id = ? AND EXISTS
          (SELECT 1 FROM mp_payments WHERE id = ? AND status = 'reversed')`)
          .bind(order.id, String(payment.id), String(payment.id)),
        db.prepare('INSERT INTO mp_events(payment_id,order_id,status,at) VALUES (?,?,?,?)')
          .bind(String(payment.id), order.id, state, now)
      ]);
    }
  };
}

function view(o, now) {
  return { id: o.id, kind: o.kind, item: o.item, ars: o.ars, state: o.state, createdAt: o.created_at,
    expired: o.expires_at <= now, checkoutUrl: o.expires_at > now && o.state === 'open' ? o.checkout_url : null };
}
function preferenceMatches(p, order) {
  const item = p.items?.length === 1 ? p.items[0] : null;
  return !!p.id && p.external_reference === order.id && String(p.collector_id) === order.collector_id
    && item?.id === `style:${order.item}` && item.quantity === 1 && item.currency_id === 'ARS'
    && Number(item.unit_price) === order.ars;
}

export function createMercadoPago({ fetcher = fetch, needSession, readJson } = {}) {
  async function remote(ctx, path, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetcher(`https://api.mercadopago.com${path}`, {
        // Workers admite manual; una respuesta 3xx se rechaza sin reenviar la clave.
        method: body ? 'POST' : 'GET', redirect: 'manual', signal: ctl.signal,
        headers: { authorization: `Bearer ${ctx.env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json',
          ...(path.startsWith('/v1/chargebacks/') ? { 'x-caller-id': String(ctx.env.MP_COLLECTOR_ID) } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!res.ok) fail(res.status >= 400 && res.status < 500 ? 424 : 503, 'mpUnavailable');
      const text = await res.text();
      if (text.length > 200000) fail(503, 'mpUnavailable');
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof MercadoPagoError) throw err;
      fail(503, 'mpUnavailable');
    } finally { clearTimeout(timer); }
  }
  function cfg(ctx, enabled = false) {
    const c = mercadoPagoConfig(ctx.env);
    // Las consultas y callbacks de pedidos anteriores siguen funcionando con nuevas ventas apagadas.
    if ((enabled && !c.enabled) || !ctx.env.MP_ACCESS_TOKEN || !ctx.env.MP_WEBHOOK_SECRET || !PAYMENT_ID.test(c.collector)) fail(404, 'mpDisabled');
    return c;
  }
  async function reconcile(ctx, order, paymentId, fetched = null) {
    const payment = fetched ?? await remote(ctx, `/v1/payments/${paymentId}`);
    let modeMatches = payment.live_mode === !!order.live_mode;
    // Las credenciales de un vendedor ficticio pueden devolver live_mode:true.
    // Solo admitirlo en pruebas explícitas y comprobando el vendedor en la API.
    if (!modeMatches && !order.live_mode && payment.live_mode === true
      && ctx.env.MP_LIVE_MODE === 'false' && ctx.env.MP_TEST_ACCOUNT === 'true') {
      const seller = await remote(ctx, '/users/me');
      modeMatches = Array.isArray(seller.tags) && seller.tags.includes('test_user') && String(seller.id) === order.collector_id;
    }
    if (String(payment.id) !== paymentId || payment.external_reference !== order.id
      || String(payment.collector_id) !== order.collector_id || !modeMatches
      || payment.currency_id !== 'ARS' || !Number.isFinite(Number(payment.transaction_amount))
      || Number(payment.transaction_amount) * 100 !== order.ars * 100
      || !Number.isFinite(Date.parse(payment.date_created)) || !Number.isFinite(Date.parse(payment.date_last_updated))
      || !/^[a-z_]{1,40}$/.test(payment.status || '')
      || Date.parse(payment.date_created) < order.created_at - 60000) fail(409, 'mpMismatch');
    await mpStore(ctx.env.DB).apply(order, payment, ctx.t);
  }
  async function sync(ctx, order) {
    const store = mpStore(ctx.env.DB);
    if (!(await store.claimCheck(order.id, ctx.t))) return;
    if (order.state === 'creating') {
      // No repetir un POST cuyo resultado se desconoce: recuperar la preferencia por referencia.
      const found = await remote(ctx, `/checkout/preferences/search?external_reference=${order.id}`);
      const p = found.elements?.find((p) => p.external_reference === order.id && String(p.collector_id) === order.collector_id);
      if (p?.id) {
        const full = await remote(ctx, `/checkout/preferences/${encodeURIComponent(p.id)}`);
        const url = safeCheckoutUrl(full.init_point);
        if (url && preferenceMatches(full, order)) await store.attach(order.id, String(full.id), url);
      }
    }
    const result = await remote(ctx, `/v1/payments/search?external_reference=${order.id}&sort=date_created&criteria=desc&limit=10`);
    for (const p of result.results ?? []) {
      if (PAYMENT_ID.test(String(p.id))) await reconcile(ctx, order, String(p.id));
    }
  }
  return {
    'GET /api/rift/mp': async (ctx) => {
      const c = mercadoPagoConfig(ctx.env);
      return json({ ok: true, enabled: c.enabled, prices: c.prices, holder: c.enabled ? String(ctx.env.MP_HOLDER || '') : '' });
    },
    'POST /api/rift/mp/order': async (ctx) => {
      const s = await needSession(ctx);
      const c = cfg(ctx, true);
      const { item } = await readJson(ctx.request, 2000);
      const ars = c.prices[`style:${item}`];
      if (!ars) fail(400, 'badOrder');
      if (!(await ctx.store.hasCredentials(s.player.id))) fail(403, 'protect');
      if (await ctx.store.hasPurchase(s.player.id, 'style', item)) fail(409, 'owned');
      const store = mpStore(ctx.env.DB);
      const existing = await store.open(s.player.id, item);
      if (existing) return json({ ok: true, existing: true, order: view(existing, ctx.t) });
      const o = { id: id(), player: s.player.id, item, ars, collector: c.collector, live: c.live, now: ctx.t };
      if (!(await store.add(o))) {
        const first = await store.open(s.player.id, item);
        if (first) return json({ ok: true, existing: true, order: view(first, ctx.t) });
        fail(429, 'tooManyOrders');
      }
      const back = `${c.site}/cargo/?mp_order=${o.id}`;
      let p;
      try {
        p = await remote(ctx, '/checkout/preferences', {
          external_reference: o.id, items: [{ id: `style:${item}`, title: `Rift Cargo · ${MP_ITEM_NAMES[item]}`, quantity: 1, currency_id: 'ARS', unit_price: ars }],
          back_urls: { success: back, pending: back, failure: back }, auto_return: 'approved',
          notification_url: `${c.site}/api/rift/mp/webhook?source_news=webhooks`,
          expires: true, expiration_date_to: new Date(o.now + TTL).toISOString(),
          payment_methods: { installments: 1 }, statement_descriptor: 'RIFT CARGO'
        });
      } catch (e) {
        if (e.status === 424) await store.failed(o.id); // Error explícito; un timeout se conserva para recuperación.
        throw e;
      }
      const url = safeCheckoutUrl(p.init_point);
      if (!url || !preferenceMatches(p, await store.order(o.id))) fail(503, 'mpMismatch');
      await store.attach(o.id, String(p.id), url);
      return json({ ok: true, order: view(await store.order(o.id), ctx.t) });
    },
    'GET /api/rift/mp/orders': async (ctx) => {
      const s = await needSession(ctx);
      return json({ ok: true, orders: (await mpStore(ctx.env.DB).mine(s.player.id)).map((o) => view(o, ctx.t)) });
    },
    'POST /api/rift/mp/sync': async (ctx) => {
      const s = await needSession(ctx);
      cfg(ctx);
      const { id } = await readJson(ctx.request, 2000);
      const store = mpStore(ctx.env.DB);
      const order = ORDER_ID.test(id || '') ? await store.order(id) : null;
      if (!order || order.player_id !== s.player.id) fail(404, 'noOrder');
      await sync(ctx, order);
      return json({ ok: true, order: view(await store.order(id), ctx.t) });
    },
    'POST /api/rift/mp/webhook': async (ctx) => {
      cfg(ctx);
      const resourceId = await verifyMpWebhook(ctx.request, ctx.env.MP_WEBHOOK_SECRET);
      if (!resourceId) fail(401, 'signature');
      const body = await readJson(ctx.request, 4000);
      if (String(body.data?.id) !== resourceId || !['payment', 'topic_chargebacks_wh'].includes(body.type)) fail(400, 'badNotification');
      let ids = [resourceId];
      if (body.type === 'topic_chargebacks_wh') {
        // El cuerpo no elige qué pago actualizar: los IDs salen del caso consultado a MP.
        const chargeback = await remote(ctx, `/v1/chargebacks/${resourceId}`);
        if (String(chargeback.id) !== resourceId || !Array.isArray(chargeback.payments)) fail(409, 'mpMismatch');
        ids = chargeback.payments.map((p) => String(typeof p === 'object' ? p?.id : p));
        if (!ids.length || ids.length > 10 || ids.some((p) => !PAYMENT_ID.test(p))) fail(409, 'mpMismatch');
      }
      for (const paymentId of new Set(ids)) {
        const p = await remote(ctx, `/v1/payments/${paymentId}`);
        const order = ORDER_ID.test(p.external_reference || '') ? await mpStore(ctx.env.DB).order(p.external_reference) : null;
        if (order) await reconcile(ctx, order, paymentId, p);
      }
      return json({ ok: true });
    }
  };
}
