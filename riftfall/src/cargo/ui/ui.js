// Interfaz de Rift Cargo con aspecto de panel de control: barra superior, tarjetas de indicadores,
// panel de operaciones con pestañas, seguimiento de envío, tarjeta de la nave elegida, avisos y el
// tutorial. Lee el estado de la simulación y llama a las acciones; no guarda estado propio del juego.

import { icon } from '../icons.js';
import { t, num, money, pct, dur, lang, setLang } from '../i18n.js';
import { BOX, CARGO_IDS, PORTS, SHIPS, SHIP_IDS, UPGRADES, UPGRADE_IDS, LEVELS } from '../sim/data.js';
import {
  available, freeSpace, depotCap, stockTotal, incomingTotal, value, upgradeCost, estimate, buyQuote,
  buyPrice, priceTrend, isIdle, incomePerMin, onTimeRate, levelProgress, unlockedPorts, fleetCap, shipById
} from '../sim/sim.js';
import { position, dist } from '../sim/orbit.js';
import { shipThumb } from '../render/thumbs.js';
import { morph } from './morph.js';
import { LIVERY_IDS, TRAIL_IDS, LIVERIES, TRAILS, STYLE_ITEMS } from '../../shared/cargo-style.js';
import { C, LIVERY, LIVERY_LOOKS, TRAIL_COLORS, hex } from '../render/palette.js';
import * as style from '../style.js';
import { account as rgAccount, claimPurchase, onAccount } from '../../rift/account.js';
import { openInMetaMask } from '../../rift/open-in-metamask.js';
import { remoteWallet } from '../../rift/wallet.js';

const $ = (sel, el = document) => el.querySelector(sel);
const shipName = (s) => s.name;
const cargoName = (c) => t(`cargo.${c}`);
const portName = (p) => t(`port.${p}`);
const cg = (c, cls = '') => `<span class="cg cg-${c} ${cls}">${icon(c)}</span>`;
const until = (at, cls = '') => `<b class="until ${cls}" data-until="${at}"></b>`;

/** Lo que trae el pack (para saber si ya está todo). */
const PACK_ALL = Object.keys(STYLE_ITEMS).filter((id) => id !== 'pack');

const STATUS_PILL = {
  parked: 'idle', queued: 'wait', docking: 'loading', docked: 'loading', waitdrones: 'wait', working: 'loading',
  liftoff: 'route', travel: 'route', portwork: 'port', landing: 'route'
};

export function statusText(s) {
  if (s.status === 'travel') return t('status.travel', { to: portName(s.leg.target) });
  if (s.status === 'portwork') return t('status.portwork', { port: portName(s.port) });
  if (s.status === 'working' && s.work?.kind === 'unload') return t('status.unloading');
  return t(`status.${s.status}`);
}

function pill(s) {
  const kind = STATUS_PILL[s.status] ?? 'idle';
  const label = s.status === 'parked' && !s.job ? t('pill.idle') : kind === 'loading' ? (s.work?.kind === 'unload' ? t('status.unloading') : t('pill.loading')) : t(`pill.${kind}`);
  return `<span class="pill pill-${kind}">${label}</span>`;
}

/** Cuándo termina el tramo actual de una nave (en tiempo de simulación) o null. */
function shipEta(s, state) {
  if (s.status === 'travel') return s.leg.t0 + s.leg.dur;
  if (['portwork', 'liftoff', 'docking', 'landing'].includes(s.status)) return state.t + (s.dur - s.timer);
  return null;
}

export function createUI({ state, actions, isMap }) {
  const root = document.createElement('div');
  root.className = 'ui';
  root.innerHTML = shell();
  document.getElementById('app').appendChild(root);

  const ui = {
    tab: 'orders',
    expanded: new Set(),
    trackId: null,
    detailId: null,
    lastRender: 0,
    sig: '',
    sheet: false
  };

  // ---------- Esqueleto ----------
  function shell() {
    return `
    <header class="topbar card">
      <div class="brand"><span class="brand-cube">${logoSvg()}</span><span class="brand-name">Rift <b>Cargo</b></span></div>
      <div class="views seg" role="tablist">
        <button class="seg-btn on" data-act="view" data-v="station">${icon('station')}<span data-t="view.station"></span></button>
        <button class="seg-btn" data-act="view" data-v="map" id="mapToggle">${icon('orbit')}<span data-t="view.map"></span></button>
      </div>
      <button class="hub" data-act="tab" data-v="station">
        <span class="hub-ic">${icon('station')}</span>
        <span class="hub-txt"><b data-t="hub.name"></b><small id="hubSub"></small></span>
        ${icon('right', 'hub-chev')}
      </button>
      <div class="live">
        <span class="live-dot"></span><span id="liveLabel" data-t="live"></span><b id="clock"></b>
        <button class="speed" data-act="speed" id="speedBtn" aria-label="${t('speed')}">1×</button>
      </div>
      <div class="money">${icon('coins')}<b id="credits"></b></div>
      <button class="bell" data-act="bell" aria-label="bell">${icon('bell')}<i id="bellDot"></i></button>
      <button class="profile" data-act="menu">
        <span class="avatar">${icon('user')}</span>
        <span class="who"><b id="lvlLabel"></b><small data-t="role"></small><span class="xp"><i id="xpBar"></i></span></span>
        ${icon('chevDown', 'who-chev')}
      </button>
    </header>

    <section class="kpis" id="kpis"></section>

    <div class="camctl card">
      <button data-act="cam" data-v="in" title="">${icon('plus')}</button>
      <button data-act="cam" data-v="out">${icon('minus')}</button>
      <button data-act="cam" data-v="left">${icon('rotl')}</button>
      <button data-act="cam" data-v="right">${icon('rotr')}</button>
      <button data-act="cam" data-v="home">${icon('focus')}</button>
    </div>

    <aside class="ops card" id="ops">
      <div class="sheet-grip" data-act="sheet"></div>
      <nav class="tabs" id="tabs">
        <button data-act="tab" data-v="orders">${icon('orders')}<span data-t="tab.orders"></span><i class="badge" id="ordersBadge"></i></button>
        <button data-act="tab" data-v="market">${icon('cart')}<span data-t="tab.market"></span></button>
        <button data-act="tab" data-v="fleet">${icon('rocket')}<span data-t="tab.fleet"></span></button>
        <button data-act="tab" data-v="station">${icon('upgrade')}<span data-t="tab.station"></span><i class="badge dot" id="upBadge"></i></button>
      </nav>
      <div class="panel" id="panel"></div>
    </aside>

    <section class="track card" id="track"></section>
    <section class="detail card" id="detail" hidden></section>
    <div class="toasts" id="toasts"></div>
    <div class="modal" id="modal" hidden></div>
    <div class="coach" id="coach" hidden></div>
    <div class="menu card" id="menu" hidden></div>
    <nav class="mtabs" id="mtabs">
      <button data-act="mtab" data-v="orders">${icon('orders')}<span data-t="tab.orders"></span><i class="badge" id="mOrdersBadge"></i></button>
      <button data-act="mtab" data-v="market">${icon('cart')}<span data-t="tab.market"></span></button>
      <button data-act="view" data-v="map" class="mtab-map">${icon('orbit')}<span data-t="tab.map"></span></button>
      <button data-act="mtab" data-v="fleet">${icon('rocket')}<span data-t="tab.fleet"></span></button>
      <button data-act="mtab" data-v="station">${icon('upgrade')}<span data-t="tab.station"></span></button>
    </nav>`;
  }

  function applyStatic() {
    root.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
    const cam = { in: 'cam.in', out: 'cam.out', left: 'cam.left', right: 'cam.right', home: 'cam.home' };
    root.querySelectorAll('[data-act="cam"]').forEach((b) => (b.title = t(cam[b.dataset.v])));
  }
  applyStatic();

  // ---------- Barra superior e indicadores ----------
  let speedIdx = 0;
  const SPEEDS = [1, 2, 3, 0];

  function renderTop() {
    $('#credits', root).textContent = money(state.credits);
    $('#lvlLabel', root).textContent = t('level', { n: state.level });
    $('#xpBar', root).style.width = `${Math.round(levelProgress(state) * 100)}%`;
    const busy = state.docks.slice(0, value(state, 'docks')).filter((x) => x != null).length;
    $('#hubSub', root).textContent = t('hub.sub', { full: Math.round(((stockTotal(state) + incomingTotal(state)) / depotCap(state)) * 100), busy, docks: value(state, 'docks') });
    const d = new Date();
    $('#clock', root).textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const sp = SPEEDS[speedIdx];
    const sb = $('#speedBtn', root);
    if (sb.dataset.v !== String(sp)) {
      sb.dataset.v = String(sp);
      sb.innerHTML = sp ? `${sp}×` : icon('pause');
    }
    $('#liveLabel', root).textContent = sp ? t('live') : t('paused');
    root.classList.toggle('is-paused', !sp);
    const open = state.offers.length;
    for (const id of ['#ordersBadge', '#mOrdersBadge']) {
      const b = $(id, root);
      b.textContent = open || '';
      b.hidden = !open;
    }
    const canUp = UPGRADE_IDS.some((id) => {
      const c = upgradeCost(state, id);
      return c && state.level >= c.level && state.credits >= c.cost;
    });
    $('#upBadge', root).hidden = !canUp;
  }

  let lastStock = stockTotal(state);
  let stockDelta = 0;
  function renderKpis() {
    const total = stockTotal(state);
    if (total !== lastStock) {
      stockDelta = total - lastStock;
      lastStock = total;
    }
    const enRoute = state.ships.filter((s) => s.job && !['parked'].includes(s.status)).length;
    const home = state.ships.length - state.ships.filter((s) => ['travel', 'portwork', 'liftoff'].includes(s.status)).length;
    const kpi = (ic, label, val, chip, sub, cls = '') => `
      <div class="kpi card ${cls}">
        <span class="kpi-ic">${icon(ic)}</span>
        <div><small>${label}</small><b>${val}${chip ?? ''}</b><em>${sub}</em></div>
      </div>`;
    const chip = (v, unit = '') => (v ? `<i class="chip ${v > 0 ? 'pos' : 'neg'}">${icon(v > 0 ? 'up' : 'down')}${v > 0 ? '+' : ''}${num(v)}${unit}</i>` : '');
    morph($('#kpis', root),
      kpi('box', t('kpi.stock'), `${num(total)} t`, chip(stockDelta), t('kpi.stockSub', { cap: num(depotCap(state)) })) +
      kpi('rocket', t('kpi.fleet'), `${enRoute}<span class="of">/${state.ships.length}</span>`, '', t('kpi.fleetSub', { n: home })) +
      kpi('clock', t('kpi.ontime'), pct(onTimeRate(state)), '', t('kpi.ontimeSub', { n: num(state.stats.delivered) }), 'hide-sm') +
      kpi('coins', t('kpi.income'), `${money(incomePerMin(state))}<span class="of">/min</span>`, '', t('kpi.incomeSub'), 'hide-md'));
  }

  // ---------- Panel de operaciones ----------
  const idleShips = () => state.ships.filter(isIdle);

  function offerCard(o) {
    const isOrder = o.kind === 'order';
    const fits = idleShips().filter((s) => SHIPS[s.model].cap >= o.tons);
    const stockOk = !isOrder || available(state, o.cargo) >= o.tons;
    const options = stockOk
      ? fits.map((s) => ({ s, e: estimate(state, s, o.kind, o) })).sort((a, b) => (b.e.onTime - a.e.onTime) || (a.e.deliverAt - b.e.deliverAt))
      : [];
    const best = options[0];
    const title = isOrder ? t('order.wants', { port: `<b>${portName(o.to)}</b>`, tons: o.tons, cargo: cargoName(o.cargo) }) : t('freight.title', { tons: o.tons, cargo: cargoName(o.cargo) });
    const sub = isOrder ? `${icon('station')} ${t('order.fromDepot')}` : `${icon('route')} ${t('freight.route', { from: portName(o.from), to: portName(o.to) })}`;
    const open = ui.expanded.has(o.id);
    let action;
    if (!stockOk) {
      const port = unlockedPorts(state).find((p) => PORTS[p].sells.includes(o.cargo));
      action = `<div class="warn">${icon('alert')}${t('order.noStock', { have: available(state, o.cargo), cargo: cargoName(o.cargo) })}</div>
        ${port ? `<button class="btn ghost sm" data-act="goMarket" data-v="${port}">${icon('cart')}${t('order.buyMore', { port: portName(port) })}</button>` : ''}`;
    } else if (!best) {
      action = `<div class="warn muted">${icon('rocket')}${t('order.noShip', { tons: o.tons })}</div>`;
    } else {
      const row = ({ s, e }, primary) => `
        <button class="btn ${primary ? 'primary' : 'line'} send" data-act="send" data-offer="${o.id}" data-ship="${s.id}">
          <span class="send-l">${icon('send')}${primary ? t('order.sendWith', { ship: shipName(s) }) : `${shipName(s)} · ${t(`ship.${s.model}`)}`}</span>
          <span class="send-r">${t('order.arrives', { t: '' })}${until(e.deliverAt)} <i class="${e.onTime ? 'ok' : 'bad'}">${icon(e.onTime ? 'check' : 'alert')}</i></span>
        </button>`;
      action = `${row(best, true)}
        <div class="net">${t('order.net', { v: `<b>${money(o.reward - best.e.fuel)}</b>` })} <span>· ${t('order.fuel', { v: money(best.e.fuel) })}</span></div>
        ${options.length > 1 ? `<button class="more" data-act="expand" data-v="${o.id}">${icon(open ? 'chevUp' : 'chevDown')}${t('order.pickShip')} (${options.length})</button>` : ''}
        ${open ? `<div class="alts">${options.slice(1).map((x) => row(x, false)).join('')}</div>` : ''}`;
    }
    return `
      <article class="offer ${o.urgent ? 'urgent' : ''} ${o.tutorial ? 'tut-target' : ''}" data-offer-card="${o.id}">
        <div class="offer-top">
          ${cg(o.cargo, 'lg')}
          <div class="offer-txt"><h4>${title}</h4><p>${sub}</p></div>
          <div class="offer-pay"><b>${money(o.reward)}</b>${o.urgent ? `<span class="tag hot">${icon('zap')}${t('order.urgent')}</span>` : ''}</div>
        </div>
        <div class="offer-meta">
          <span>${icon('clock')}${t('order.due', { t: '' })}${until(o.deadline)}</span>
          <span class="exp">${t('order.expires', { t: '' })}${until(o.expires)}</span>
        </div>
        <div class="offer-act">${action}</div>
      </article>`;
  }

  function renderOrders() {
    const list = [...state.offers].sort((a, b) => (b.tutorial - a.tutorial) || (b.urgent - a.urgent) || (a.expires - b.expires));
    return `<h3 class="ph">${t('orders.title')}</h3>
      ${list.length ? list.map(offerCard).join('') : `<p class="empty">${icon('clock')}${t('orders.empty')}</p>`}`;
  }

  function depotBars() {
    const cap = depotCap(state);
    const segs = CARGO_IDS.map((c) => {
      const w = (state.stock[c] / cap) * 100;
      return w > 0 ? `<i class="seg-${c}" style="width:${w}%"></i>` : '';
    }).join('');
    const inc = incomingTotal(state);
    const legend = CARGO_IDS.filter((c) => state.stock[c] || state.incoming[c])
      .map((c) => `<span>${cg(c, 'xs')}${cargoName(c)} <b>${state.stock[c]} t</b>${state.incoming[c] ? `<em>+${state.incoming[c]}</em>` : ''}</span>`).join('');
    return `<div class="depot">
      <div class="depot-top"><b>${t('market.depot')}</b><small>${t('market.free', { free: num(freeSpace(state)), cap: num(cap) })}</small></div>
      <div class="bar">${segs}${inc ? `<i class="seg-inc" style="width:${(inc / cap) * 100}%"></i>` : ''}</div>
      <div class="legend">${legend || '<span class="muted">—</span>'}</div>
    </div>`;
  }

  function renderMarket() {
    const ports = Object.keys(PORTS).filter((p) => PORTS[p].sells.length);
    const idle = idleShips().sort((a, b) => SHIPS[b.model].cap - SHIPS[a.model].cap);
    const cards = ports.map((p) => {
      const locked = PORTS[p].level > state.level;
      const c = PORTS[p].sells[0];
      const price = buyPrice(p, c, state.t);
      const trend = priceTrend(p, c, state.t);
      let act = '';
      if (locked) act = `<div class="warn muted">${icon('lock')}${t('market.locked', { n: PORTS[p].level })}</div>`;
      else if (freeSpace(state) < BOX) act = `<div class="warn">${icon('alert')}${t('market.noSpace')}</div>`;
      else if (!idle.length) act = `<div class="warn muted">${icon('rocket')}${t('market.noShip')}</div>`;
      else {
        act = idle.slice(0, 3).map((s, i) => {
          const q = buyQuote(state, p, s);
          const afford = state.credits >= q.cost;
          return `<button class="btn ${i === 0 ? 'primary' : 'line'} send" data-act="buy" data-port="${p}" data-ship="${s.id}" ${afford ? '' : 'disabled'}>
            <span class="send-l">${icon('cart')}${t('market.buyWith', { tons: q.tons, ship: shipName(s) })}</span>
            <span class="send-r">${money(q.cost)}</span></button>`;
        }).join('') + `<div class="net"><span>${t('market.back', { t: '' })}${until(buyQuote(state, p, idle[0]).doneAt)}</span></div>`;
      }
      return `<article class="offer market ${locked ? 'locked' : ''}" data-port-card="${p}">
        <div class="offer-top">
          <span class="planet-dot pd-${p}"></span>
          <div class="offer-txt"><h4>${portName(p)} <small>${t(`port.${p}.d`)}</small></h4><p>${cg(c, 'xs')}${t('market.sells', { cargo: cargoName(c) })}</p></div>
          <div class="offer-pay"><b>${money(price)}</b><small class="trend ${trend > 0 ? 'rise' : 'fall'}">${icon(trend > 0 ? 'up' : 'down')}${t('market.price', { v: '' }).trim()}</small></div>
        </div>
        <div class="offer-act">${act}</div>
      </article>`;
    }).join('');
    return `<h3 class="ph">${t('market.title')}</h3>${depotBars()}${cards}`;
  }

  function renderFleet() {
    const hasAuto = value(state, 'autopilot') > 0;
    const ships = state.ships.map((s) => {
      const eta = shipEta(s, state);
      const L = s.load;
      return `<article class="ship ${ui.detailId === s.id ? 'sel' : ''}" data-act="select" data-v="${s.id}">
        <img class="ship-img" src="${shipThumb(s.model, L?.cargo ?? 'agua', s.look)}" alt="" />
        <div class="ship-txt">
          <h4>${shipName(s)} <small>${t(`ship.${s.model}`)} · ${SHIPS[s.model].cap} t</small></h4>
          <p>${statusText(s)}${eta ? ` · ${until(eta)}` : ''}</p>
          ${L ? `<p class="load">${cg(L.cargo, 'xs')}${L.tons} t ${cargoName(L.cargo)}</p>` : ''}
        </div>
        ${pill(s)}
        <div class="ship-row" data-stop>
          <label class="auto ${hasAuto ? '' : 'off'}">
            ${icon('bot')}<span>${t('fleet.auto')}</span>
            <select data-act="auto" data-ship="${s.id}" ${hasAuto ? '' : 'disabled'}>
              ${['off', 'supply', 'orders', 'freight'].map((m) => `<option value="${m}" ${s.auto === m ? 'selected' : ''}>${t(`auto.${m}`)}</option>`).join('')}
            </select>
          </label>
          <button class="btn line sm sty-btn" data-act="style" data-v="${s.id}" title="${t('style.title')}">${icon('brush')}<span>${t('style.open')}</span></button>
        </div>
      </article>`;
    }).join('');
    const full = state.ships.length >= fleetCap(state);
    const shop = SHIP_IDS.map((m) => {
      const def = SHIPS[m];
      const locked = state.level < def.level;
      return `<article class="buyship ${locked ? 'locked' : ''}">
        <img src="${shipThumb(m, m === 'colibri' ? 'agua' : m === 'mula' ? 'mineral' : 'piezas')}" alt="" />
        <div><h4>${t(`ship.${m}`)}</h4><p>${t(`ship.${m}.d`)}</p>
          <p class="specs"><span>${icon('box')}${def.cap} t</span><span>${icon('gauge')}${def.speed}</span></p></div>
        <button class="btn ${locked || full ? 'line' : 'primary'} sm" data-act="buyShip" data-v="${m}" ${locked || full || state.credits < def.price ? 'disabled' : ''}>
          ${locked ? `${icon('lock')}${t('up.needLevel', { n: def.level })}` : money(def.price)}</button>
      </article>`;
    }).join('');
    return `<button class="sty-cta" data-act="style">${icon('brush', 'sty-cta-ic')}<span><b>${t('style.cta')}</b><small>${t('style.ctaSub')}</small></span>${icon('right')}</button>
      <h3 class="ph">${t('fleet.title')} <small>${t('fleet.hangar', { n: state.ships.length, cap: fleetCap(state) })}</small></h3>
      ${hasAuto ? '' : `<p class="hint">${icon('bot')}${t('fleet.autoLocked')}</p>`}
      ${ships}
      <h3 class="ph sub">${t('fleet.buy')}</h3>${full ? `<p class="hint">${icon('alert')}${t('fleet.full')}</p>` : ''}${shop}`;
  }

  const UP_ICONS = { docks: 'dock', drones: 'drone', depot: 'layers', hangar: 'home', engines: 'gauge', shields: 'shield', autopilot: 'bot' };
  function upValue(id, v) {
    if (id === 'depot') return `${num(v)} t`;
    if (id === 'engines') return `+${Math.round((v - 1) * 100)}%`;
    if (id === 'shields' || id === 'autopilot') return v ? '✓' : '—';
    return String(v);
  }

  function renderStation() {
    const ups = UPGRADE_IDS.map((id) => {
      const lv = state.up[id];
      const cur = UPGRADES[id][lv].v;
      const next = upgradeCost(state, id);
      const steps = UPGRADES[id].length;
      const dots = Array.from({ length: steps - 1 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      let btn;
      if (!next) btn = `<span class="maxed">${icon('check')}${t('up.max')}</span>`;
      else if (state.level < next.level) btn = `<button class="btn line sm" disabled>${icon('lock')}${t('up.needLevel', { n: next.level })}</button>`;
      else btn = `<button class="btn primary sm" data-act="upgrade" data-v="${id}" ${state.credits < next.cost ? 'disabled' : ''}>${money(next.cost)}</button>`;
      return `<article class="up">
        <span class="up-ic">${icon(UP_ICONS[id])}</span>
        <div class="up-txt"><h4>${t(`up.${id}`)} <b>${upValue(id, cur)}${next ? ` <span>→ ${upValue(id, next.v)}</span>` : ''}</b></h4><p>${t(`up.${id}.d`)}</p><div class="dots">${dots}</div></div>
        ${btn}
      </article>`;
    }).join('');
    const st = state.stats;
    return `<h3 class="ph">${t('station.title')}</h3>${ups}
      <h3 class="ph sub">${t('station.stats')}</h3>
      <div class="stats">
        <div><small>${t('stat.earned')}</small><b>${money(st.earned)}</b></div>
        <div><small>${t('stat.spent')}</small><b>${money(st.spent)}</b></div>
        <div><small>${t('stat.delivered')}</small><b>${num(st.delivered)}</b></div>
        <div><small>${t('stat.tons')}</small><b>${num(st.tons)} t</b></div>
      </div>`;
  }

  function signature() {
    return JSON.stringify([
      ui.tab, lang, [...ui.expanded], ui.detailId, state.level, state.up, Math.floor(state.credits / 50),
      state.offers.map((o) => o.id), state.ships.map((s) => [s.id, s.status, s.step, s.auto, s.load?.tons, s.job?.id, s.name, s.look?.livery, s.look?.trail]),
      state.stock, state.incoming, state.reserved
    ]);
  }

  function renderPanel(force = false) {
    const now = performance.now();
    const sig = signature();
    if (!force && sig === ui.sig && now - ui.lastRender < 1000) return;
    ui.sig = sig;
    ui.lastRender = now;
    const panel = $('#panel', root);
    if (panel.dataset.tab !== ui.tab) {
      panel.dataset.tab = ui.tab;
      panel.innerHTML = '';
      panel.scrollTop = 0;
    }
    morph(panel, { orders: renderOrders, market: renderMarket, fleet: renderFleet, station: renderStation }[ui.tab]());
    root.querySelectorAll('[data-act="tab"], [data-act="mtab"]').forEach((b) => b.classList.toggle('on', b.dataset.v === ui.tab && !(b.classList.contains('hub'))));
    tick();
  }

  /** Actualiza las cuentas regresivas sin volver a dibujar todo. */
  function tick() {
    root.querySelectorAll('[data-until]').forEach((el) => {
      const left = Number(el.dataset.until) - state.t;
      el.textContent = dur(left);
      el.classList.toggle('neg', left < 0);
    });
  }

  // ---------- Seguimiento de envío ----------
  const TRACK_NODES = {
    order: ['track.accepted', 'track.loading', 'track.transit', 'track.delivered', 'track.return'],
    buy: ['track.bought', 'track.transit', 'track.loading', 'track.return', 'track.unload'],
    freight: ['track.accepted', 'track.pickup', 'track.transit', 'track.delivered', 'track.return']
  };
  const NODE_OF_STEP = { order: [1, 1, 2, 3, 4, 4], buy: [1, 2, 3, 4, 4, 4], freight: [1, 1, 2, 3, 4, 4] };
  const NODE_ICONS = { order: ['check', 'box', 'rocket', 'flag', 'home'], buy: ['cart', 'rocket', 'box', 'home', 'layers'], freight: ['check', 'box', 'rocket', 'flag', 'home'] };

  function activeShips() {
    return state.ships.filter((s) => s.job).sort((a, b) => b.job.started - a.job.started);
  }

  function renderTrack() {
    const list = activeShips();
    let s = shipById(state, ui.trackId);
    if (!s?.job) s = list[0];
    ui.trackId = s?.id ?? null;
    const el = $('#track', root);
    el.classList.toggle('is-empty', !s);
    if (!s) {
      morph(el, `<div class="track-head">${icon('route')}<b>${t('track.title')}</b><span class="muted">${t('track.none')}</span></div>`);
      return;
    }
    const j = s.job;
    const node = NODE_OF_STEP[j.kind][s.step] ?? 4;
    const nodes = TRACK_NODES[j.kind].map((k, i) => {
      const cls = i < node ? 'done' : i === node ? 'now' : '';
      let sub = '';
      if (i === node) {
        const eta = shipEta(s, state);
        if (s.status === 'working' && s.work) sub = `${Math.min(s.work.n, s.work.dropped)}/${s.work.n}`;
        else if (eta) sub = until(eta);
        else sub = statusText(s);
      }
      return `<li class="${cls}"><span class="nd">${icon(i < node ? 'check' : NODE_ICONS[j.kind][i])}</span><b>${t(k)}</b><small>${sub}</small></li>`;
    }).join('');
    const dest = j.kind === 'buy' ? j.from : j.to;
    const idLabel = t(`track.${j.kind}`, { id: j.id });
    const pos = list.indexOf(s);
    morph(el, `
      <div class="track-head">${icon('route')}<b>${t('track.title')}</b><span class="muted">${idLabel} · ${shipName(s)}</span>
        ${list.length > 1 ? `<span class="track-nav"><button data-act="trackPrev">${icon('left')}</button><i>${pos + 1}/${list.length}</i><button data-act="trackNext">${icon('right')}</button></span>` : ''}
      </div>
      <div class="track-body">
        <ol class="steps">${nodes}</ol>
        <button class="shipcard" data-act="select" data-v="${s.id}">
          <img src="${shipThumb(s.model, j.cargo, s.look)}" alt="" />
          <div><b>#${j.id} · ${shipName(s)}</b><small>${t('track.to', { port: portName(dest) })} · ${cg(j.cargo, 'xs')}${j.tons} t</small>${pill(s)}</div>
          ${icon('right')}
        </button>
      </div>`);
    tick();
  }

  // ---------- Tarjeta de la nave elegida ----------
  function renderDetail() {
    const el = $('#detail', root);
    const s = shipById(state, ui.detailId);
    el.hidden = !s;
    if (!s) return;
    const eta = shipEta(s, state);
    const dest = s.status === 'travel' ? s.leg.target : s.job ? (s.job.kind === 'buy' ? s.job.from : s.job.to) : null;
    const row = (k, v) => `<div class="row"><small>${k}</small><b>${v}</b></div>`;
    morph(el, `
      <div class="detail-head">
        <img src="${shipThumb(s.model, s.load?.cargo ?? 'agua', s.look)}" alt="" />
        <div><small>${t(`ship.${s.model}`).toUpperCase()} · ${SHIPS[s.model].cap} t</small><h4>${shipName(s)}</h4></div>
        <button class="x" data-act="closeDetail">${icon('x')}</button>
      </div>
      <div class="detail-status">${pill(s)}<span>${statusText(s)}</span></div>
      ${row(t('detail.cargo'), s.load ? `${cg(s.load.cargo, 'xs')}${s.load.tons} t ${cargoName(s.load.cargo)}` : t('detail.empty'))}
      ${row(t('detail.dest'), dest ? portName(dest) : '—')}
      ${row(t('detail.eta'), eta ? until(eta) : '—')}
      ${row(t('detail.trips'), num(s.trips))}
      ${row(t('detail.earned'), money(s.earned))}
      <button class="btn line sm wide" data-act="follow" data-v="${s.id}">${icon('focus')}${t('detail.follow')}</button>`);
    tick();
  }

  // ---------- Avisos ----------
  function toast(html, kind = 'info', ms = 3800) {
    const box = $('#toasts', root);
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }
  const errToast = (reason) => toast(`${icon('alert')}<span>${t(`toast.err.${reason}`)}</span>`, 'err', 2600);

  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'delivered') {
        const s = shipById(state, e.ship);
        if (e.late) toast(`${icon('alert')}<span>${t('toast.late', { ship: s?.name ?? '', port: portName(e.port) })}</span><b>+${money(e.net)}</b>`, 'warn');
        else toast(`${cg(e.cargo, 'sm')}<span>${t('toast.delivered', { ship: s?.name ?? '', tons: e.tons, cargo: cargoName(e.cargo), port: portName(e.port) })}</span><b>+${money(e.net)}</b>`, 'ok');
        actions.sound?.('coin');
      } else if (e.type === 'loaded') {
        const s = shipById(state, e.ship);
        toast(`${cg(e.cargo, 'sm')}<span>${t('toast.loaded', { ship: s?.name ?? '', tons: e.tons, cargo: cargoName(e.cargo), port: portName(e.port) })}</span>`, 'info', 2600);
      } else if (e.type === 'level') {
        showLevel(e.level);
        actions.sound?.('level');
      } else if (e.type === 'newShip') {
        const s = shipById(state, e.ship);
        toast(`${icon('rocket')}<span>${t('toast.newShip', { ship: `${s.name} · ${t(`ship.${s.model}`)}` })}</span>`, 'ok');
      } else if (e.type === 'upgrade') {
        toast(`${icon('upgrade')}<span>${t('toast.upgrade', { name: t(`up.${e.id}`) })}</span>`, 'ok');
      } else if (e.type === 'dispatch') {
        ui.trackId = e.ship;
      }
      tutorialEvent(e);
    }
  }

  // ---------- Ventanas ----------
  function modal(html) {
    const m = $('#modal', root);
    m.innerHTML = `<div class="modal-card card">${html}</div>`;
    m.hidden = false;
  }
  const closeModal = () => ($('#modal', root).hidden = true);

  function showLevel(n) {
    const items = [];
    for (const p of Object.keys(PORTS)) if (PORTS[p].level === n && p !== 'hq') items.push(`${icon('orbit')}${t('unlock.port', { port: portName(p) })}`);
    for (const m of SHIP_IDS) if (SHIPS[m].level === n && n > 1) items.push(`${icon('rocket')}${t('unlock.ship', { ship: t(`ship.${m}`) })}`);
    for (const id of UPGRADE_IDS) if (UPGRADES[id].some((x) => x.level === n)) items.push(`${icon(UP_ICONS[id])}${t('unlock.up', { name: t(`up.${id}`) })}`);
    items.push(`${icon('star')}${t('unlock.more')}`);
    modal(`<div class="lvl-badge">${icon('star')}<b>${n}</b></div>
      <h2>${t('unlock.title', { n })}</h2><p>${t('unlock.sub')}</p>
      <ul class="unlocks">${items.map((x) => `<li>${x}</li>`).join('')}</ul>
      <button class="btn primary wide" data-act="closeModal">${t('unlock.ok')}</button>`);
  }

  function showAway(sum) {
    modal(`<div class="lvl-badge away">${icon('clock')}</div>
      <h2>${t('away.title')}</h2><p>${t('away.sub', { t: dur(sum.seconds) })}</p>
      <div class="stats two">
        <div><small>${t('away.earned')}</small><b>${money(sum.earned)}</b></div>
        <div><small>${t('away.delivered')}</small><b>${num(sum.delivered)}</b></div>
      </div>
      ${sum.delivered ? '' : `<p class="hint">${icon('bot')}${t('away.tip')}</p>`}
      <button class="btn primary wide" data-act="closeModal">${t('away.ok')}</button>`);
  }

  function acctLine() {
    const a = rgAccount();
    if (!a) return t('menu.acctOffline');
    return a.player.guest ? t('menu.acctGuest') : `${a.player.name || t('menu.acctSafe')} · ${t('menu.acctSafe')}`;
  }
  /** Punto dorado en el avatar mientras la cuenta es de invitado (falta protegerla). */
  function renderAcct() {
    const a = rgAccount();
    root.querySelector('.profile')?.classList.toggle('guest', !!a?.player?.guest);
  }
  onAccount(renderAcct);
  renderAcct();

  function toggleMenu() {
    const m = $('#menu', root);
    if (!m.hidden) return (m.hidden = true);
    m.innerHTML = `
      ${rgAccount() ? `<button class="mi acct" data-act="account">${icon('user')}<span><b>${t('menu.account')}</b><small>${acctLine()}</small></span></button>` : ''}
      <small>${t('menu.lang')}</small>
      <div class="seg">${['es', 'en', 'pt'].map((l) => `<button class="seg-btn ${lang === l ? 'on' : ''}" data-act="lang" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div>
      <button class="mi" data-act="style">${icon('brush')}${t('menu.style')}</button>
      <button class="mi" data-act="sound">${icon(actions.isMuted?.() ? 'mute' : 'sound')}${t('menu.sound')}</button>
      <a class="mi" href="/">${icon('zap')}${t('menu.riftfall')}</a>
      <button class="mi danger" data-act="reset">${icon('rotl')}${t('menu.reset')}</button>`;
    m.hidden = false;
  }

  // ---------- Taller de estilo (estéticos pagados) ----------
  // Se prueba antes de comprar: tocar una pintura o una estela la muestra en la vista previa; si es
  // tuya, además se aplica a la nave. Lo que no tenés muestra su precio y los botones de pago.
  const sty = { open: false, shipId: null, livery: 'rift', trail: 'cian', price: null, busy: null };
  const fmtBnb = (n) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-AR', { maximumFractionDigits: 6 }).format(n);
  const itemName = (item) => {
    if (item.startsWith('liv-')) return t('item.liv', { name: t(`liv.${item.slice(4)}`) });
    if (item.startsWith('trail-')) return t('item.trail', { name: t(`trail.${item.slice(6)}`) });
    return t(`item.${item}`);
  };
  const lookOf = (s) => ({ livery: s?.look?.livery ?? 'rift', trail: s?.look?.trail ?? 'cian' });

  function openStyle(shipId) {
    const s = shipById(state, shipId) ?? shipById(state, ui.detailId) ?? state.ships[0];
    Object.assign(sty, { open: true, shipId: s?.id ?? null, ...lookOf(s) });
    $('#menu', root).hidden = true;
    renderStyle(true);
    if (sty.price == null) {
      style.bnbPrice().then((p) => (sty.price = p)).catch(() => (sty.price = 0)).finally(() => sty.open && renderStyle());
    }
    checkPending();
  }

  /** Pagos que quedaron sin confirmar (se cerró la página): se verifican solos. */
  function checkPending() {
    if (!style.loadStyle().pending.length || style.styleBusy()) return;
    style.retryPending().then((done) => {
      for (const rec of done) toast(`${icon('sparkle')}<span>${t('style.bought', { name: itemName(rec.item) })}</span>`, 'ok', 4200);
      if (done.length) {
        renderPanel(true);
        if (sty.open) renderStyle();
      }
    }).catch(() => {});
  }

  function swatch(kind, id, s) {
    const item = `${kind}-${id}`;
    const has = style.has(item);
    const def = kind === 'liv' ? LIVERIES[id] : TRAILS[id];
    const cur = lookOf(s)[kind === 'liv' ? 'livery' : 'trail'] === id;
    const sel = (kind === 'liv' ? sty.livery : sty.trail) === id;
    let a;
    let b;
    if (kind === 'liv') {
      const p = LIVERY_LOOKS[id];
      a = p ? p.hull : s?.model === 'titan' ? 0x56609a : C.white;
      b = p?.accent ?? LIVERY[s?.model ?? 'colibri'];
    } else [a, b] = TRAIL_COLORS[id];
    const tag = has ? (cur ? t('style.using') : t('style.owned')) : STYLE_ITEMS[item] ? `US$ ${STYLE_ITEMS[item].usd}` : t('style.founderTag', { tier: t(`founder.${def.founder}`) });
    return `<button class="sw ${sel ? 'on' : ''} ${has ? 'has' : 'lock'}" data-act="${kind === 'liv' ? 'styLiv' : 'styTrail'}" data-v="${id}">
      <i class="sw-dot ${kind}" style="--a:${hex(a)};--b:${hex(b)}"></i><span>${t(`${kind === 'liv' ? 'liv' : 'trail'}.${id}`)}</span>
      <small>${has ? '' : icon('lock')}${tag}</small></button>`;
  }

  function payButtons(item) {
    const usd = STYLE_ITEMS[item].usd;
    const busy = sty.busy;
    const label = (m, txt) => (busy?.item === item && busy.method === m ? t(`style.stage.${busy.stage}`) : txt);
    const bnb = sty.price ? style.bnbFor(item, sty.price) : 0;
    return `<div class="pay-row">
      <button class="btn primary sm" data-act="styBuy" data-v="${item}" data-m="usdt" ${busy ? 'disabled' : ''}>${icon('wallet')}${label('usdt', t('style.payUsdt', { n: usd }))}</button>
      <button class="btn line sm" data-act="styBuy" data-v="${item}" data-m="bnb" ${busy || !bnb ? 'disabled' : ''}>${label('bnb', bnb ? t('style.payBnb', { n: fmtBnb(bnb) }) : sty.price === 0 ? t('style.noPrice') : '…')}</button>
    </div>`;
  }

  /** Caja de compra de lo que se está probando y no es tuyo (o el aviso del Pase Fundador). */
  function buyBox(item, def) {
    if (style.has(item)) return '';
    if (!STYLE_ITEMS[item]) {
      return `<div class="sty-buy founder">${icon('star')}<span>${t('style.founderHint', { tier: t(`founder.${def.founder}`) })}</span>
        <a class="btn line sm" href="/?panel=founder">${t('style.founderGo')}</a></div>`;
    }
    return `<div class="sty-buy"><div class="sty-buy-txt"><b>${t('style.buy', { name: itemName(item) })}</b><small>US$ ${STYLE_ITEMS[item].usd}</small></div>${payButtons(item)}</div>`;
  }

  function renderStyle(fresh = false) {
    const s = shipById(state, sty.shipId);
    // Al redibujar, la sección de restaurar queda como estaba (abierta o cerrada).
    const restoreOpen = !fresh && !!$('#modal .sty-restore', root)?.open;
    const owned = style.owned();
    const ships = state.ships.map((x) => `<button class="seg-btn ${x.id === sty.shipId ? 'on' : ''}" data-act="styShip" data-v="${x.id}">${x.name}</button>`).join('');
    const preview = s ? shipThumb(s.model, s.load?.cargo ?? 'agua', { livery: sty.livery, trail: sty.trail }, { thrust: 0.9, w: 560, h: 260 }) : '';
    const plates = owned.has('plates');
    const sign = owned.has('sign');
    const pack = PACK_ALL.every((x) => owned.has(x));
    const html = `
      <div class="sty-head"><span class="sty-ic">${icon('brush')}</span>
        <div><h2>${t('style.title')}</h2><p>${t('style.sub')}</p></div>
        <button class="x" data-act="closeModal" aria-label="close">${icon('x')}</button></div>
      <div class="seg sty-ships">${ships}</div>
      <div class="sty-preview">${preview ? `<img src="${preview}" alt="" />` : ''}<span class="sty-plate">${s ? s.name : ''}</span></div>
      <h3 class="ph">${icon('brush')}${t('style.livery')}</h3>
      <div class="sw-grid">${LIVERY_IDS.map((id) => swatch('liv', id, s)).join('')}</div>
      ${buyBox(`liv-${sty.livery}`, LIVERIES[sty.livery])}
      <h3 class="ph">${icon('zap')}${t('style.trail')}</h3>
      <div class="sw-grid">${TRAIL_IDS.map((id) => swatch('trail', id, s)).join('')}</div>
      ${buyBox(`trail-${sty.trail}`, TRAILS[sty.trail])}
      <h3 class="ph">${icon('tag')}${t('style.plate')}</h3>
      <p class="sty-d">${t('style.plateD')}</p>
      ${plates
        ? `<div class="sty-field"><input id="styPlate" maxlength="10" autocomplete="off" spellcheck="false" placeholder="${t('style.platePh')}" value="${s ? s.name : ''}" /><button class="btn line sm" data-act="styPlate">${t('style.save')}</button></div>`
        : buyBox('plates')}
      <h3 class="ph">${icon('sign')}${t('style.sign')}</h3>
      <p class="sty-d">${t('style.signD')}</p>
      ${sign
        ? `<div class="sty-field"><input id="stySign" maxlength="18" autocomplete="off" spellcheck="false" placeholder="${t('style.signPh')}" value="${style.signText()}" /><button class="btn line sm" data-act="stySign">${t('style.save')}</button></div>`
        : buyBox('sign')}
      <div class="sty-pack ${pack ? 'owned' : ''}">
        <div class="sty-pack-txt"><b>${icon('sparkle')}${t('style.pack')}</b><small>${pack ? t('style.packOwned') : t('style.packD')}</small></div>
        ${pack ? icon('check') : `<span class="sty-pack-price">US$ ${STYLE_ITEMS.pack.usd}</span>${payButtons('pack')}`}
      </div>
      <details class="sty-restore" ${restoreOpen ? 'open' : ''}><summary>${t('style.restore')}</summary>
        <div class="sty-field"><input id="styHash" placeholder="0x…" autocomplete="off" spellcheck="false" /><button class="btn line sm" data-act="styRestore">${t('style.verify')}</button></div>
      </details>
      <p class="sty-note">${t('style.note')}</p>`;
    const m = $('#modal', root);
    const card = m.querySelector('.modal-card.style');
    if (fresh || !card || m.hidden) {
      m.innerHTML = `<div class="modal-card card style">${html}</div>`;
      m.hidden = false;
    } else {
      // Se conserva lo que el jugador está escribiendo en los campos de texto.
      const keep = {};
      for (const id of ['styPlate', 'stySign', 'styHash']) {
        const el = card.querySelector(`#${id}`);
        if (el && document.activeElement === el) keep[id] = el.value;
      }
      morph(card, html);
      for (const [id, v] of Object.entries(keep)) {
        const el = card.querySelector(`#${id}`);
        if (el) el.value = v;
      }
    }
  }

  /** Aplica a la nave lo que se está probando, si es del jugador. */
  function applyLook() {
    const s = shipById(state, sty.shipId);
    if (!s) return;
    const look = { ...lookOf(s) };
    if (style.has(`liv-${sty.livery}`)) look.livery = sty.livery;
    if (style.has(`trail-${sty.trail}`)) look.trail = sty.trail;
    s.look = look.livery === 'rift' && look.trail === 'cian' ? undefined : look;
    actions.restyle?.();
    renderPanel(true);
    renderDetail();
  }

  async function buyItem(item, method) {
    // Sin wallet en el navegador y sin WalletConnect: abrir el juego en MetaMask o instalarla.
    if (!style.hasWallet() && !remoteWallet()) {
      actions.persist?.();
      openInMetaMask(style.metamaskLink, { lang });
      return;
    }
    sty.busy = { item, method, stage: 'wallet' };
    renderStyle();
    try {
      const rec = await style.buyStyle(item, method, (stage) => {
        sty.busy = { item, method, stage };
        renderStyle();
      });
      sty.busy = null;
      // La compra queda también en la Cuenta Rift (en todos tus dispositivos).
      claimPurchase(rec.tx).catch(() => {});
      applyLook();
      toast(`${icon('sparkle')}<span>${t('style.bought', { name: itemName(rec.item) })}</span>`, 'ok', 4200);
      actions.sound?.('level');
    } catch (err) {
      sty.busy = null;
      styleError(err);
    }
    if (sty.open) renderStyle();
  }

  function styleError(err) {
    const code = err?.code;
    const key = typeof code === 'string' && t(`style.err.${code}`) !== `style.err.${code}` ? `style.err.${code}` : null;
    const msg = key ? t(key) : t('style.err.generic', { msg: String(err?.shortMessage ?? err?.message ?? err).slice(0, 90) });
    toast(`${icon('alert')}<span>${msg}</span>`, 'err', 4800);
  }

  // ---------- Tutorial ----------
  const TUT = state.flags;
  function coach(html, anchor, buttons = []) {
    const c = $('#coach', root);
    c.innerHTML = `<div class="coach-body">${html}</div><div class="coach-btns">
      <button class="link" data-act="tutSkip">${t('tut.skip')}</button>
      ${buttons.map((b) => `<button class="btn primary sm" data-act="${b.act}">${b.label}</button>`).join('')}</div>`;
    c.hidden = false;
    c.dataset.anchor = anchor ?? '';
    placeCoach();
  }
  function placeCoach() {
    const c = $('#coach', root);
    if (c.hidden) return;
    const sel = c.dataset.anchor;
    const a = sel ? root.querySelector(sel) ?? document.querySelector(sel) : null;
    root.querySelectorAll('.glow-target').forEach((x) => x.classList.remove('glow-target'));
    if (!a || !a.getClientRects().length) {
      c.classList.add('center');
      c.style.left = c.style.top = '';
      return;
    }
    a.classList.add('glow-target');
    c.classList.remove('center');
    const r = a.getBoundingClientRect();
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    let x = r.left - cw - 16;
    let y = r.top;
    let side = 'left';
    if (x < 8) {
      x = Math.min(window.innerWidth - cw - 8, Math.max(8, r.left + r.width / 2 - cw / 2));
      y = r.bottom + 12;
      side = 'top';
      if (y + ch > window.innerHeight - 8) {
        y = r.top - ch - 12;
        side = 'bottom';
      }
    }
    c.dataset.side = side;
    c.style.left = `${x}px`;
    c.style.top = `${Math.max(8, Math.min(window.innerHeight - ch - 8, y))}px`;
  }
  function tutorial() {
    const step = TUT.tut ?? 0;
    if (step >= 99) return ($('#coach', root).hidden = true);
    if (step === 0) {
      ui.tab = 'orders';
      coach(`<b>${t('tut.1')}</b><p>${t('tut.1b')}</p>`, '.tut-target .btn.primary', []);
    } else if (step === 1) coach(`<p>${t('tut.2')}</p>`, null, [{ act: 'tutNext', label: t('tut.next') }]);
    else if (step === 2) coach(`<p>${t('tut.3')}</p>`, isMobile() ? '.mtab-map' : '#mapToggle', []);
    else if (step === 3) coach(`<p>${t('tut.4')}</p>`, null, [{ act: 'tutNext', label: t('tut.next') }]);
    else if (step === 4) coach(`<p>${t('tut.5')}</p>`, isMobile() ? '[data-act="mtab"][data-v="market"]' : '#tabs [data-v="market"]', [{ act: 'tutDone', label: t('tut.ok') }]);
  }
  function setTut(n) {
    TUT.tut = n;
    tutorial();
  }
  function tutorialEvent(e) {
    const step = TUT.tut ?? 0;
    if (step === 0 && e.type === 'dispatch') setTut(1);
  }
  function tutorialTick() {
    const step = TUT.tut ?? 0;
    if (step === 1) {
      const s = state.ships.find((x) => x.job);
      if (s && ['liftoff', 'travel'].includes(s.status)) setTut(2);
    }
    if (step === 2 && isMap()) setTut(3);
    placeCoach();
  }

  const isMobile = () => window.innerWidth < 760;

  // ---------- Clicks ----------
  root.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (ev.target.closest('[data-stop]') && el.dataset.act === 'select') return;
    const act = el.dataset.act;
    const v = el.dataset.v;
    actions.sound?.('click');
    switch (act) {
      case 'tab':
        ui.tab = v === 'station' && el.classList.contains('hub') ? 'station' : v;
        setSheet(true);
        renderPanel(true);
        break;
      case 'mtab':
        if (ui.tab === v && ui.sheet) setSheet(false);
        else {
          ui.tab = v;
          setSheet(true);
        }
        if (isMap()) actions.setView('station');
        renderPanel(true);
        break;
      case 'sheet':
        setSheet(!ui.sheet);
        break;
      case 'view':
        actions.setView(v === 'map' && isMap() && isMobile() ? 'station' : v);
        if (isMobile()) setSheet(false);
        break;
      case 'send': {
        const r = actions.accept(Number(el.dataset.offer), Number(el.dataset.ship));
        if (!r.ok) errToast(r.reason);
        else {
          ui.expanded.delete(Number(el.dataset.offer));
          ui.trackId = Number(el.dataset.ship);
          actions.sound?.('send');
          if (isMobile()) setSheet(false);
          renderTrack();
          renderKpis();
        }
        renderPanel(true);
        break;
      }
      case 'buy': {
        const r = actions.buy(el.dataset.port, Number(el.dataset.ship));
        if (!r.ok) errToast(r.reason);
        else {
          ui.trackId = Number(el.dataset.ship);
          actions.sound?.('send');
          if (isMobile()) setSheet(false);
          renderTrack();
          renderKpis();
        }
        renderPanel(true);
        break;
      }
      case 'goMarket':
        ui.tab = 'market';
        renderPanel(true);
        setTimeout(() => root.querySelector(`[data-port-card="${v}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
        break;
      case 'expand': {
        const id = Number(v);
        ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
        renderPanel(true);
        break;
      }
      case 'upgrade': {
        const r = actions.upgrade(v);
        if (!r.ok) errToast(r.reason);
        else actions.sound?.('level');
        renderPanel(true);
        break;
      }
      case 'buyShip': {
        const r = actions.buyShip(v);
        if (!r.ok) errToast(r.reason);
        renderPanel(true);
        break;
      }
      case 'select':
        ui.detailId = Number(v);
        actions.select(ui.detailId);
        renderDetail();
        renderPanel(true);
        break;
      case 'closeDetail':
        ui.detailId = null;
        actions.select(null);
        renderDetail();
        break;
      case 'follow':
        actions.follow(Number(v));
        break;
      case 'trackPrev':
      case 'trackNext': {
        const list = activeShips();
        const i = list.findIndex((s) => s.id === ui.trackId);
        const n = list[(i + (act === 'trackNext' ? 1 : -1) + list.length) % list.length];
        ui.trackId = n?.id ?? null;
        renderTrack();
        break;
      }
      case 'speed':
        speedIdx = (speedIdx + 1) % SPEEDS.length;
        actions.setSpeed(SPEEDS[speedIdx]);
        renderTop();
        break;
      case 'cam':
        actions.cam(v);
        break;
      case 'menu':
        toggleMenu();
        break;
      case 'bell':
        ui.tab = 'orders';
        setSheet(true);
        renderPanel(true);
        break;
      case 'lang':
        setLang(v);
        applyStatic();
        toggleMenu();
        toggleMenu();
        renderAll(true);
        actions.langChanged?.();
        break;
      case 'sound':
        actions.toggleSound?.();
        toggleMenu();
        toggleMenu();
        break;
      case 'reset':
        if (confirm(t('menu.resetConfirm'))) actions.reset();
        break;
      case 'closeModal':
        sty.open = false;
        closeModal();
        break;
      case 'account':
        $('#menu', root).hidden = true;
        actions.openAccount?.();
        break;
      case 'style':
        openStyle(v != null ? Number(v) : null);
        break;
      case 'styShip': {
        const s = shipById(state, Number(v));
        Object.assign(sty, { shipId: s?.id ?? null, ...lookOf(s) });
        renderStyle();
        break;
      }
      case 'styLiv':
        sty.livery = v;
        applyLook();
        renderStyle();
        break;
      case 'styTrail':
        sty.trail = v;
        applyLook();
        renderStyle();
        break;
      case 'styBuy':
        if (!sty.busy) buyItem(v, el.dataset.m);
        break;
      case 'styPlate': {
        const s = shipById(state, sty.shipId);
        if (!s || !style.has('plates')) break;
        const name = style.cleanPlate($('#styPlate', root)?.value);
        s.baseName ??= s.name; // la matrícula de fábrica, para volver a ella si se borra el nombre
        s.name = name || s.baseName;
        actions.restyle?.();
        toast(`${icon('check')}<span>${t('style.saved')}</span>`, 'ok', 1800);
        renderPanel(true);
        renderDetail();
        renderTrack();
        renderStyle();
        break;
      }
      case 'stySign':
        if (actions.setSign?.($('#stySign', root)?.value ?? '')) toast(`${icon('check')}<span>${t('style.saved')}</span>`, 'ok', 1800);
        renderStyle();
        break;
      case 'styRestore': {
        const input = $('#styHash', root);
        el.disabled = true;
        style.verifyStylePayment(input?.value ?? '')
          .then((rec) => {
            claimPurchase(rec.tx, { sign: false }).catch(() => {});
            toast(`${icon('check')}<span>${t('style.restored', { name: itemName(rec.item) })}</span>`, 'ok', 4200);
            applyLook();
          })
          .catch(styleError)
          .finally(() => sty.open && renderStyle());
        break;
      }
      case 'tutNext':
        setTut((TUT.tut ?? 0) + 1);
        break;
      case 'tutDone':
      case 'tutSkip':
        setTut(99);
        break;
    }
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-act="auto"]');
    if (!el) return;
    const r = actions.setAuto(Number(el.dataset.ship), el.value);
    if (!r.ok) errToast(r.reason);
    renderPanel(true);
  });
  document.addEventListener('pointerdown', (ev) => {
    const m = $('#menu', root);
    if (!m.hidden && !ev.target.closest('#menu') && !ev.target.closest('[data-act="menu"]')) m.hidden = true;
  });
  window.addEventListener('resize', () => placeCoach());

  function setSheet(open) {
    ui.sheet = open;
    root.classList.toggle('sheet-open', open);
  }

  function renderAll(force) {
    renderTop();
    renderKpis();
    renderPanel(force);
    renderTrack();
    renderDetail();
  }

  let acc = 0;
  let acc2 = 0;
  return {
    root,
    toast,
    showAway,
    checkPending,
    tutorial,
    setView(v) {
      root.querySelectorAll('.views .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
      root.classList.toggle('in-map', v === 'map');
      root.querySelector('.mtab-map')?.classList.toggle('on', v === 'map');
    },
    goMarket(port) {
      ui.tab = 'market';
      setSheet(true);
      renderPanel(true);
      setTimeout(() => root.querySelector(`[data-port-card="${port}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    },
    select(id) {
      ui.detailId = id;
      if (id != null) ui.trackId = shipById(state, id)?.job ? id : ui.trackId;
      renderDetail();
      renderTrack();
    },
    update(dt, events, raw = dt) {
      if (events.length) handleEvents(events);
      dt = raw;
      acc += dt;
      acc2 += dt;
      if (acc > 0.25) {
        acc = 0;
        tick();
        renderTop();
        renderPanel(false);
        tutorialTick();
      }
      if (acc2 > 0.5) {
        acc2 = 0;
        renderKpis();
        renderTrack();
        renderDetail();
      }
    },
    renderAll
  };
}

function logoSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 56 18 32 32 8 18z" fill="#4de8ff"/><path d="M8 18 32 32v28L8 46z" fill="#9d6bff"/><path d="M56 18 32 32v28l24-14z" fill="#ff4dd2"/><path d="M22 47 28 37l8 6" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
