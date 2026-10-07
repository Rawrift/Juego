// Simulación de Rift Cargo. Es independiente del dibujo: el estado es un objeto plano que se puede
// guardar en JSON, y `step(state, dt)` lo hace avanzar. La interfaz llama a las acciones (aceptar un
// pedido, comprar carga, mejorar la estación) y lee los eventos que quedan en `state.events`.

import { BOX, DRONE_CYCLE, HQ_TIMES, CARGO, CARGO_IDS, PORTS, PORT_IDS, SHIPS, EVOS, UPGRADES, UPGRADE_IDS, LEVELS, START } from './data.js';
import { position, intercept, avgDistance, dist } from './orbit.js';

export const VERSION = 1;
const MAX_DOCKS = 4;
const INCOME_WINDOW = 300;

// ---------- Azar repetible (guardado en el estado) ----------

export function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
const round10 = (n) => Math.round(n / 10) * 10;
const zeros = () => Object.fromEntries(CARGO_IDS.map((c) => [c, 0]));

// ---------- Lecturas ----------

export const value = (s, id) => UPGRADES[id][s.up[id]].v;
export const depotCap = (s) => value(s, 'depot');
export const stockTotal = (s) => CARGO_IDS.reduce((a, c) => a + s.stock[c], 0);
export const incomingTotal = (s) => CARGO_IDS.reduce((a, c) => a + s.incoming[c], 0);
export const freeSpace = (s) => depotCap(s) - stockTotal(s) - incomingTotal(s);
export const available = (s, c) => s.stock[c] - s.reserved[c];
export const unlockedPorts = (s) => PORT_IDS.filter((p) => PORTS[p].level <= s.level);
const evoOf = (ship) => EVOS[ship.evo ?? 0] ?? EVOS[0];
export const shipSpeed = (s, ship) => SHIPS[ship.model].speed * value(s, 'engines') * evoOf(ship).speed;
/** Combustible por unidad de distancia (la evolución lo baja). */
export const shipFuel = (ship) => SHIPS[ship.model].fuel * evoOf(ship).fuel;
/** ¿Cruza el cinturón sin frenar? (escudos de la estación o nave blindada) */
export const shipShielded = (s, ship) => value(s, 'shields') > 0 || !!SHIPS[ship.model].armor;
export const fleetCap = (s) => value(s, 'hangar');
export const isIdle = (ship) => !ship.job && ship.status === 'parked';
export const levelProgress = (s) => {
  const lo = LEVELS[s.level - 1] ?? 0;
  const hi = LEVELS[s.level] ?? lo;
  return hi > lo ? Math.min(1, (s.xp - lo) / (hi - lo)) : 1;
};
export const onTimeRate = (s) => (s.stats.delivered ? s.stats.onTime / s.stats.delivered : 1);
export const incomePerMin = (s) => {
  const from = s.t - INCOME_WINDOW;
  const sum = s.income.filter(([t]) => t >= from).reduce((a, [, v]) => a + v, 0);
  return (sum / Math.min(INCOME_WINDOW, Math.max(60, s.t))) * 60;
};
/** Cargas que hoy se pueden conseguir (las venden los planetas habilitados). */
export const buyableCargo = (s) => [...new Set(unlockedPorts(s).flatMap((p) => PORTS[p].sells))];
export const shipById = (s, id) => s.ships.find((x) => x.id === id);

/** Precio de compra en un planeta productor: sube y baja despacio con el tiempo. */
export function buyPrice(port, cargo, t) {
  let h = 0;
  for (const ch of port + cargo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const period = 260 + (h % 140);
  const base = CARGO[cargo].price;
  return Math.round(base * (1 + 0.2 * Math.sin((t / period) * Math.PI * 2 + (h % 628) / 100)));
}
export const priceTrend = (port, cargo, t) => Math.sign(buyPrice(port, cargo, t + 20) - buyPrice(port, cargo, t));

// ---------- Partida nueva ----------

export function newGame(seed = Date.now()) {
  const s = {
    v: VERSION,
    seed: seed >>> 0,
    t: 0,
    credits: START.credits,
    xp: 0,
    level: 1,
    stock: { ...zeros(), ...START.stock },
    reserved: zeros(),
    incoming: zeros(),
    up: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])),
    ships: [],
    docks: Array(MAX_DOCKS).fill(null),
    offers: [],
    nextId: 1,
    nextOffer: 14,
    stats: { delivered: 0, onTime: 0, late: 0, earned: 0, spent: 0, tons: 0, bought: 0 },
    income: [],
    events: [],
    flags: {}
  };
  for (const m of START.ships) addShip(s, m);
  // Primer pedido garantizado (el tutorial lo usa): se puede cumplir con el stock inicial.
  s.offers.push(makeOrder(s, { port: 'vesta', cargo: 'agua', tons: 20, reward: 2600, window: 420, life: 900, tutorial: true }));
  s.offers.push(makeOrder(s, { port: 'ferra', cargo: 'alimentos', tons: 20, window: 360, life: 300 }));
  s.offers.push(makeFreight(s, { from: 'ferra', to: 'kepa', cargo: 'mineral', tons: 20 }) ?? genOffer(s));
  return s;
}

function addShip(s, model) {
  const id = s.nextId++;
  const ship = {
    id,
    model,
    name: `RC-${100 + s.ships.length + 1}`,
    status: 'parked',
    park: s.ships.length,
    dock: -1,
    job: null,
    step: 0,
    timer: 0,
    dur: 0,
    pos: position('hq', s.t),
    leg: null,
    work: null,
    load: null, // { cargo, tons } a bordo
    from: 'park',
    auto: 'off',
    autoT: 0,
    trips: 0,
    earned: 0,
    evo: 0
  };
  s.ships.push(ship);
  return ship;
}

// ---------- Ofertas: pedidos (desde el depósito) y fletes (de un planeta a otro) ----------

const maxOffers = (s) => Math.min(8, 4 + Math.floor(s.level / 2));
const biggestCap = (s) => Math.max(...s.ships.map((x) => SHIPS[x.model].cap));

function randomTons(s) {
  const maxBoxes = Math.max(1, Math.min(12, 1 + s.level, Math.floor(biggestCap(s) / BOX)));
  // Más seguido pedidos chicos; de vez en cuando uno grande.
  const k = Math.floor(Math.pow(rand(s), 1.6) * maxBoxes) + 1;
  return k * BOX;
}

/** Segundos estimados desde que se acepta un pedido hasta entregarlo con una nave liviana. */
function quickDelivery(s, to, tons) {
  const waves = Math.ceil(tons / BOX / Math.max(1, value(s, 'drones')));
  return HQ_TIMES.docking + waves * DRONE_CYCLE + HQ_TIMES.liftoff + avgDistance('hq', to) / SHIPS.colibri.speed + (PORTS[to].portTime ?? 2) + tons / 12;
}

function makeOrder(s, { port, cargo, tons, reward, urgent = false, window, life, tutorial = false }) {
  const avg = avgDistance('hq', port);
  const r = rand(s);
  reward ??= round10((tons * CARGO[cargo].price * (1.9 + r * 0.5) + tons * avg * 0.9) * (urgent ? 1.5 : 1));
  window ??= 75 + quickDelivery(s, port, tons) * (urgent ? 1.4 : 2.1);
  life ??= (urgent ? 50 : 85) + rand(s) * 35;
  return { id: s.nextId++, kind: 'order', cargo, tons, to: port, reward, urgent, deadline: s.t + window, expires: s.t + life, at: s.t, tutorial };
}

function makeFreight(s, { from, to, cargo, tons }) {
  if (!from || !to || from === to) return null;
  const leg = avgDistance(from, to);
  const reach = avgDistance('hq', from);
  const reward = round10(tons * (leg * 1.1 + 10) + tons * reach * 0.3);
  const window = 110 + ((reach + leg) / SHIPS.colibri.speed) * 2.2;
  return { id: s.nextId++, kind: 'freight', cargo, tons, from, to, reward, urgent: false, deadline: s.t + window, expires: s.t + 80 + rand(s) * 40, at: s.t };
}

export function genOffer(s) {
  const ports = unlockedPorts(s);
  const goods = buyableCargo(s);
  if (rand(s) < 0.68) {
    const consumers = ports.filter((p) => PORTS[p].buys.some((c) => goods.includes(c)));
    const port = pick(s, consumers);
    const cargo = pick(s, PORTS[port].buys.filter((c) => goods.includes(c)));
    return makeOrder(s, { port, cargo, tons: randomTons(s), urgent: s.level >= 2 && rand(s) < 0.2 });
  }
  const producers = ports.filter((p) => PORTS[p].sells.length);
  const from = pick(s, producers);
  const cargo = PORTS[from].sells[0];
  const buyers = ports.filter((p) => p !== from && PORTS[p].buys.includes(cargo));
  if (!buyers.length) return makeOrder(s, { port: pick(s, ports.filter((p) => PORTS[p].buys.length)), cargo: 'agua', tons: randomTons(s) });
  return makeFreight(s, { from, to: pick(s, buyers), cargo, tons: randomTons(s) });
}

function updateOffers(s) {
  for (const o of s.offers) if (o.expires <= s.t) s.events.push({ type: 'expired', offer: o });
  s.offers = s.offers.filter((o) => o.expires > s.t);
  if (s.t >= s.nextOffer) {
    if (s.offers.length < maxOffers(s)) {
      const o = genOffer(s);
      s.offers.push(o);
      s.events.push({ type: 'offer', offer: o });
    }
    s.nextOffer = s.t + 9 + rand(s) * 9;
  }
  // Nunca quedarse sin nada que hacer: si no hay plata para comprar, siempre hay al menos un flete.
  if (!s.offers.some((o) => o.kind === 'freight') && s.credits < 1500 && stockTotal(s) < BOX) {
    const o = genOfferOfKind(s, 'freight');
    if (o) s.offers.push(o);
  }
}

function genOfferOfKind(s, kind) {
  for (let i = 0; i < 12; i++) {
    const o = genOffer(s);
    if (o?.kind === kind) return o;
  }
  return null;
}

// ---------- Estimaciones (para mostrar tiempos y costos antes de mandar una nave) ----------

const STEP_PLANS = {
  order: (j) => [{ do: 'dock' }, { do: 'hqload' }, { do: 'fly', to: j.to }, { do: 'unload', port: j.to }, { do: 'fly', to: 'hq' }, { do: 'park' }],
  buy: (j) => [{ do: 'fly', to: j.from }, { do: 'load', port: j.from }, { do: 'fly', to: 'hq' }, { do: 'dock' }, { do: 'hqunload' }, { do: 'park' }],
  freight: (j) => [{ do: 'fly', to: j.from }, { do: 'load', port: j.from }, { do: 'fly', to: j.to }, { do: 'unload', port: j.to }, { do: 'fly', to: 'hq' }, { do: 'park' }]
};

const portWorkTime = (port, tons) => (PORTS[port].portTime ?? 2) + tons / 12;
const droneShare = (s) => Math.max(1, Math.ceil(value(s, 'drones') / value(s, 'docks')));

/**
 * Simula el trabajo sin ejecutarlo: devuelve el combustible, cuándo se entrega y cuándo vuelve.
 * `from` = desde dónde arranca la nave (por defecto está estacionada en la estación).
 */
export function estimate(s, ship, kind, job) {
  const steps = STEP_PLANS[kind](job);
  const speed = shipSpeed(s, ship);
  const shields = shipShielded(s, ship);
  const rate = shipFuel(ship);
  let t = s.t;
  let pos = position('hq', t);
  let atHq = true;
  let fuel = 0;
  let deliverAt = null;
  for (const st of steps) {
    if (st.do === 'dock') t += HQ_TIMES.docking;
    else if (st.do === 'hqload' || st.do === 'hqunload') t += Math.ceil(job.tons / BOX / Math.min(droneShare(s), job.tons / BOX)) * DRONE_CYCLE;
    else if (st.do === 'fly') {
      if (atHq) {
        t += HQ_TIMES.liftoff;
        pos = position('hq', t);
      }
      const r = intercept(pos, st.to, t, speed, shields);
      fuel += dist(pos, r.point) * rate;
      t += r.time;
      pos = r.point;
      atHq = st.to === 'hq';
    } else if (st.do === 'load' || st.do === 'unload') {
      t += portWorkTime(st.port, job.tons);
      if (st.do === 'unload') deliverAt = t;
    } else if (st.do === 'park') t += HQ_TIMES.landing;
  }
  return { fuel: Math.round(fuel), deliverAt, doneAt: t, onTime: deliverAt == null || deliverAt <= (job.deadline ?? Infinity) };
}

// ---------- Acciones del jugador ----------

function fail(reason) {
  return { ok: false, reason };
}

/** Manda la nave a cumplir una oferta (pedido o flete). */
export function acceptOffer(s, offerId, shipId) {
  const o = s.offers.find((x) => x.id === offerId);
  const ship = shipById(s, shipId);
  if (!o) return fail('gone');
  if (!ship || !isIdle(ship)) return fail('busy');
  if (o.tons > SHIPS[ship.model].cap) return fail('cap');
  if (o.kind === 'order' && available(s, o.cargo) < o.tons) return fail('stock');
  // El combustible de pedidos y fletes se descuenta del pago al entregar: nunca falta plata para salir.
  const est = estimate(s, ship, o.kind, o);
  s.offers = s.offers.filter((x) => x.id !== offerId);
  if (o.kind === 'order') s.reserved[o.cargo] += o.tons;
  startJob(s, ship, { ...o, offerId: o.id, fuel: est.fuel, eta: est.deliverAt });
  return { ok: true, est };
}

/** Compra carga en un planeta y la trae al depósito. */
export function buyCargo(s, port, shipId, tonsWanted) {
  const ship = shipById(s, shipId);
  if (!ship || !isIdle(ship)) return fail('busy');
  if (!unlockedPorts(s).includes(port) || !PORTS[port].sells.length) return fail('locked');
  const cargo = PORTS[port].sells[0];
  const cap = SHIPS[ship.model].cap;
  const space = Math.floor(freeSpace(s) / BOX) * BOX;
  const tons = Math.min(cap, space, tonsWanted ?? cap);
  if (tons < BOX) return fail('space');
  const price = buyPrice(port, cargo, s.t);
  const job = { kind: 'buy', cargo, tons, from: port, price };
  const est = estimate(s, ship, 'buy', job);
  const cost = tons * price + est.fuel;
  if (s.credits < cost) return fail('money');
  spend(s, cost);
  s.stats.bought += tons;
  s.incoming[cargo] += tons;
  startJob(s, ship, { ...job, id: s.nextId++, fuel: est.fuel, cost });
  return { ok: true, est, cost, tons };
}

/** Cuánto se puede comprar con una nave en un planeta (para la interfaz). */
export function buyQuote(s, port, ship) {
  const cargo = PORTS[port].sells[0];
  const tons = Math.min(SHIPS[ship.model].cap, Math.floor(freeSpace(s) / BOX) * BOX);
  const price = buyPrice(port, cargo, s.t);
  const est = estimate(s, ship, 'buy', { kind: 'buy', cargo, tons: Math.max(tons, BOX), from: port });
  return { cargo, tons, price, fuel: est.fuel, cost: tons * price + est.fuel, doneAt: est.doneAt };
}

export function upgradeCost(s, id) {
  const next = UPGRADES[id][s.up[id] + 1];
  return next ? { cost: next.cost, level: next.level ?? 1, v: next.v } : null;
}

export function buyUpgrade(s, id) {
  const next = upgradeCost(s, id);
  if (!next) return fail('max');
  if (s.level < next.level) return fail('level');
  if (s.credits < next.cost) return fail('money');
  spend(s, next.cost);
  s.up[id]++;
  s.events.push({ type: 'upgrade', id, v: next.v });
  return { ok: true };
}

/**
 * Compra una nave con créditos. Los modelos exclusivos piden el plano: `owned` = artículos del
 * jugador (Set con 'ship-<modelo>'), que la simulación no conoce por sí sola.
 */
export function buyShip(s, model, owned = null) {
  const m = SHIPS[model];
  if (!m) return fail('unknown');
  if (m.bp && !owned?.has(`ship-${model}`)) return fail('blueprint');
  if (s.level < m.level) return fail('level');
  if (s.ships.length >= fleetCap(s)) return fail('hangar');
  if (s.credits < m.price) return fail('money');
  spend(s, m.price);
  const ship = addShip(s, model);
  s.events.push({ type: 'newShip', ship: ship.id });
  return { ok: true, ship };
}

/** Lo que cuesta la próxima evolución de una nave (null si ya está al máximo). */
export function evolveCost(s, ship) {
  const next = EVOS[(ship?.evo ?? 0) + 1];
  if (!ship || !next) return null;
  return { cost: Math.round((SHIPS[ship.model].price * next.cost) / 100) * 100, level: next.level, mk: (ship.evo ?? 0) + 2 };
}

/** Evoluciona una nave (Mk II, Mk III): se puede en cualquier momento, aunque esté viajando. */
export function evolveShip(s, shipId) {
  const ship = shipById(s, shipId);
  if (!ship) return fail('gone');
  const next = evolveCost(s, ship);
  if (!next) return fail('max');
  if (s.level < next.level) return fail('level');
  if (s.credits < next.cost) return fail('money');
  spend(s, next.cost);
  ship.evo = (ship.evo ?? 0) + 1;
  s.events.push({ type: 'evolve', ship: ship.id, mk: next.mk });
  return { ok: true };
}

export function setAuto(s, shipId, mode) {
  const ship = shipById(s, shipId);
  if (!ship) return fail('gone');
  if (mode !== 'off' && !value(s, 'autopilot')) return fail('locked');
  ship.auto = mode;
  ship.autoT = 0;
  return { ok: true };
}

/** Herramientas del Panel del dueño: créditos, nivel máximo, todas las mejoras y la flota evolucionada. */
export const OWNER_CREDITS = 100_000;
export function ownerBoost(s, kind) {
  if (kind === 'credits') s.credits += OWNER_CREDITS;
  else if (kind === 'level') {
    // Un solo aviso de nivel (no uno por cada nivel salteado).
    s.xp = Math.max(s.xp, LEVELS[LEVELS.length - 1]);
    if (s.level < LEVELS.length) s.events.push({ type: 'level', level: LEVELS.length });
    s.level = LEVELS.length;
  } else if (kind === 'upgrades') {
    for (const id of UPGRADE_IDS) s.up[id] = UPGRADES[id].length - 1;
  } else if (kind === 'evolve') {
    for (const ship of s.ships) ship.evo = EVOS.length - 1;
  } else return fail('unknown');
  return { ok: true };
}

function spend(s, n) {
  s.credits -= n;
  s.stats.spent += n;
}

function earn(s, n) {
  s.credits += n;
  s.stats.earned += n;
  s.income.push([s.t, n]);
}

function gainXp(s, n) {
  s.xp += n;
  while (s.level < LEVELS.length && s.xp >= LEVELS[s.level]) {
    s.level++;
    s.events.push({ type: 'level', level: s.level });
  }
}

// ---------- Máquina de estados de cada nave ----------

function startJob(s, ship, job) {
  ship.job = { ...job, steps: STEP_PLANS[job.kind](job), started: s.t };
  ship.step = 0;
  s.events.push({ type: 'dispatch', ship: ship.id, job: ship.job });
  beginStep(s, ship);
}

function nextStep(s, ship) {
  ship.step++;
  beginStep(s, ship);
}

function leaveSpot(s, ship) {
  if (ship.status === 'docked' && ship.dock >= 0) {
    s.docks[ship.dock] = null;
    ship.lastDock = ship.dock;
    ship.dock = -1;
    ship.from = 'dock';
  } else ship.from = 'park';
}

function beginStep(s, ship) {
  const st = ship.job?.steps[ship.step];
  if (!st) return finishJob(s, ship);
  ship.timer = 0;
  switch (st.do) {
    case 'fly':
      if (ship.status === 'parked' || ship.status === 'docked') {
        leaveSpot(s, ship);
        ship.status = 'liftoff';
        ship.dur = HQ_TIMES.liftoff;
        ship.liftTo = st.to;
      } else beginTravel(s, ship, st.to);
      return;
    case 'load':
    case 'unload':
      ship.status = 'portwork';
      ship.port = st.port;
      ship.dur = portWorkTime(st.port, ship.job.tons);
      return;
    case 'dock':
      if (ship.status === 'parked') ship.from = 'park';
      else ship.from = 'air';
      tryDock(s, ship);
      return;
    case 'hqload':
    case 'hqunload':
      ship.status = 'waitdrones';
      tryWork(s, ship);
      return;
    case 'park':
      ship.from = ship.status === 'docked' ? 'dock' : 'air';
      if (ship.status === 'docked') {
        s.docks[ship.dock] = null;
        ship.lastDock = ship.dock;
        ship.dock = -1;
      }
      ship.status = 'landing';
      ship.dur = HQ_TIMES.landing;
      return;
  }
}

function beginTravel(s, ship, to) {
  const from = { ...ship.pos };
  const r = intercept(from, to, s.t, shipSpeed(s, ship), shipShielded(s, ship));
  ship.leg = { from, to: r.point, t0: s.t, dur: Math.max(0.5, r.time), target: to };
  ship.status = 'travel';
}

function tryDock(s, ship) {
  const n = value(s, 'docks');
  const i = s.docks.findIndex((x, k) => k < n && x == null);
  if (i < 0) {
    ship.status = 'queued';
    return;
  }
  s.docks[i] = ship.id;
  ship.dock = i;
  ship.status = 'docking';
  ship.dur = HQ_TIMES.docking;
  ship.timer = 0;
}

function dronesBusy(s) {
  return s.ships.reduce((a, x) => a + (x.work?.k ?? 0), 0);
}

function tryWork(s, ship) {
  const st = ship.job.steps[ship.step];
  const free = value(s, 'drones') - dronesBusy(s);
  if (free < 1) return;
  const n = Math.round(ship.job.tons / BOX);
  const k = Math.max(1, Math.min(free, droneShare(s), n));
  ship.work = { kind: st.do === 'hqload' ? 'load' : 'unload', cargo: ship.job.cargo, n, k, t: 0, picked: 0, dropped: 0 };
  ship.status = 'working';
  if (ship.work.kind === 'unload') ship.load = { cargo: ship.job.cargo, tons: ship.job.tons };
}

function stepWork(s, ship, dt) {
  const w = ship.work;
  w.t += dt;
  const waves = Math.ceil(w.n / w.k);
  const dur = waves * DRONE_CYCLE;
  const done = w.t >= dur;
  const wave = Math.floor(w.t / DRONE_CYCLE);
  const phase = w.t / DRONE_CYCLE - wave;
  const picked = done ? w.n : Math.min(w.n, (wave + 1) * w.k);
  const dropped = done ? w.n : Math.min(w.n, wave * w.k + (phase >= 0.5 ? w.k : 0));
  const c = w.cargo;
  if (w.kind === 'load') {
    // El drone saca el contenedor de la estantería (pick) y lo deja en la nave (drop).
    const dp = picked - w.picked;
    if (dp > 0) {
      s.stock[c] -= dp * BOX;
      s.reserved[c] -= dp * BOX;
    }
    ship.load = { cargo: c, tons: dropped * BOX };
  } else {
    const dd = dropped - w.dropped;
    if (dd > 0) {
      s.stock[c] += dd * BOX;
      s.incoming[c] -= dd * BOX;
    }
    ship.load = { cargo: c, tons: (w.n - picked) * BOX };
  }
  w.picked = picked;
  w.dropped = dropped;
  if (done) {
    ship.work = null;
    if (ship.load.tons <= 0) ship.load = null;
    ship.status = 'docked';
    nextStep(s, ship);
  }
}

function finishPortWork(s, ship) {
  const st = ship.job.steps[ship.step];
  const j = ship.job;
  if (st.do === 'load') {
    ship.load = { cargo: j.cargo, tons: j.tons };
    if (j.kind === 'buy') s.events.push({ type: 'loaded', ship: ship.id, port: st.port, cargo: j.cargo, tons: j.tons });
  } else {
    ship.load = null;
    const late = s.t > j.deadline;
    const pay = late ? round10(j.reward * 0.5) : j.reward;
    earn(s, pay - j.fuel);
    s.stats.earned += j.fuel;
    s.stats.spent += j.fuel;
    ship.earned += pay - j.fuel;
    ship.trips++;
    s.stats.delivered++;
    s.stats.tons += j.tons;
    if (late) s.stats.late++;
    else s.stats.onTime++;
    gainXp(s, Math.round(j.tons * (late ? 0.15 : 1) + 4));
    s.events.push({ type: 'delivered', ship: ship.id, port: st.port, cargo: j.cargo, tons: j.tons, pay, fuel: j.fuel, net: pay - j.fuel, late, kind: j.kind });
  }
}

function finishJob(s, ship) {
  const j = ship.job;
  ship.job = null;
  ship.step = 0;
  ship.status = 'parked';
  ship.leg = null;
  if (j) s.events.push({ type: 'jobDone', ship: ship.id, kind: j.kind });
}

function stepShip(s, ship, dt) {
  switch (ship.status) {
    case 'parked':
      ship.pos = position('hq', s.t);
      if (!ship.job && ship.auto !== 'off') {
        ship.autoT -= dt;
        if (ship.autoT <= 0) {
          ship.autoT = 1.5;
          autopilot(s, ship);
        }
      }
      return;
    case 'liftoff':
    case 'docking':
    case 'landing':
      ship.pos = position('hq', s.t);
      ship.timer += dt;
      if (ship.timer >= ship.dur) {
        if (ship.status === 'liftoff') beginTravel(s, ship, ship.liftTo);
        else if (ship.status === 'docking') {
          ship.status = 'docked';
          nextStep(s, ship);
        } else {
          ship.status = 'parked';
          nextStep(s, ship);
        }
      }
      return;
    case 'travel': {
      const L = ship.leg;
      const k = Math.min(1, (s.t - L.t0) / L.dur);
      ship.pos = { x: L.from.x + (L.to.x - L.from.x) * k, z: L.from.z + (L.to.z - L.from.z) * k };
      if (k >= 1) {
        ship.at = L.target;
        if (L.target === 'hq') s.events.push({ type: 'arrived', ship: ship.id });
        nextStep(s, ship);
      }
      return;
    }
    case 'portwork':
      ship.pos = position(ship.port, s.t);
      ship.timer += dt;
      if (ship.timer >= ship.dur) {
        finishPortWork(s, ship);
        nextStep(s, ship);
      }
      return;
    case 'queued':
      ship.pos = position('hq', s.t);
      tryDock(s, ship);
      return;
    case 'waitdrones':
      ship.pos = position('hq', s.t);
      tryWork(s, ship);
      return;
    case 'working':
      ship.pos = position('hq', s.t);
      stepWork(s, ship, dt);
      return;
    case 'docked':
      ship.pos = position('hq', s.t);
      return;
  }
}

// ---------- Piloto automático ----------

function autopilot(s, ship) {
  const cap = SHIPS[ship.model].cap;
  if (ship.auto === 'orders') {
    const best = s.offers
      .filter((o) => o.kind === 'order' && o.tons <= cap && available(s, o.cargo) >= o.tons)
      .sort((a, b) => b.reward - a.reward)[0];
    if (best) acceptOffer(s, best.id, ship.id);
  } else if (ship.auto === 'freight') {
    const best = s.offers.filter((o) => o.kind === 'freight' && o.tons <= cap).sort((a, b) => b.reward / b.tons - a.reward / a.tons)[0];
    if (best) acceptOffer(s, best.id, ship.id);
  } else if (ship.auto === 'supply') {
    if (freeSpace(s) < BOX) return;
    // Repone lo que menos hay (contando lo que ya viene en camino) y que más se pide.
    const goods = buyableCargo(s);
    const demand = (c) => s.offers.filter((o) => o.kind === 'order' && o.cargo === c).reduce((a, o) => a + o.tons, 0);
    const c = goods.sort((a, b) => (s.stock[a] + s.incoming[a] - demand(a)) - (s.stock[b] + s.incoming[b] - demand(b)))[0];
    const port = unlockedPorts(s).find((p) => PORTS[p].sells.includes(c));
    if (port && s.credits >= BOX * buyPrice(port, c, s.t) + 200) buyCargo(s, port, ship.id, Math.min(cap, Math.floor((s.credits - 200) / buyPrice(port, c, s.t) / BOX) * BOX));
  }
}

// ---------- Avance del tiempo ----------

export function step(s, dt) {
  while (dt > 0) {
    const h = Math.min(dt, 0.5);
    dt -= h;
    s.t += h;
    updateOffers(s);
    for (const ship of s.ships) stepShip(s, ship, h);
  }
  if (s.income.length && s.income[0][0] < s.t - INCOME_WINDOW) s.income = s.income.filter(([t]) => t >= s.t - INCOME_WINDOW);
}

/** Avanza mucho tiempo de golpe (al volver al juego) y devuelve un resumen. */
export function fastForward(s, seconds) {
  const before = { credits: s.credits, delivered: s.stats.delivered, earned: s.stats.earned, level: s.level };
  const evs = [];
  let left = seconds;
  while (left > 0) {
    const h = Math.min(left, 1);
    step(s, h);
    left -= h;
    evs.push(...s.events.filter((e) => e.type === 'level'));
    s.events.length = 0;
  }
  return {
    seconds,
    earned: s.stats.earned - before.earned,
    delivered: s.stats.delivered - before.delivered,
    credits: s.credits - before.credits,
    levels: s.level - before.level
  };
}

/** Dónde está el trabajo de una nave, para la línea de seguimiento: [paso, total, clave]. */
export function jobProgress(ship) {
  if (!ship.job) return null;
  return { step: ship.step, steps: ship.job.steps, kind: ship.job.kind };
}
