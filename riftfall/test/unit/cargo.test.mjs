import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, step, acceptOffer, buyCargo, buyUpgrade, buyShip, setAuto, fastForward, available, freeSpace, estimate } from '../../src/cargo/sim/sim.js';
import { position, dist } from '../../src/cargo/sim/orbit.js';

const run = (s, seconds, until) => {
  for (let i = 0; i < seconds * 10; i++) {
    step(s, 0.1);
    if (until?.(s)) return true;
  }
  return false;
};

test('partida nueva: dos naves, stock inicial y el pedido del tutorial', () => {
  const s = newGame(7);
  assert.equal(s.ships.length, 2);
  assert.equal(s.stock.agua, 40);
  const tut = s.offers.find((o) => o.tutorial);
  assert.ok(tut && tut.kind === 'order' && tut.cargo === 'agua' && tut.tons === 20);
});

test('un pedido se carga con drones, viaja, se cobra y la nave vuelve a estacionar', () => {
  const s = newGame(7);
  const tut = s.offers.find((o) => o.tutorial);
  const ship = s.ships[0];
  const credits = s.credits;
  const r = acceptOffer(s, tut.id, ship.id);
  assert.ok(r.ok, r.reason);
  assert.equal(available(s, 'agua'), 20);
  const statuses = new Set();
  const done = run(s, 400, (st) => {
    statuses.add(ship.status);
    return !ship.job;
  });
  assert.ok(done, 'terminó el trabajo');
  for (const k of ['docking', 'working', 'liftoff', 'travel', 'portwork', 'landing']) assert.ok(statuses.has(k), `pasó por ${k}`);
  assert.equal(s.stock.agua, 20);
  assert.equal(s.reserved.agua, 0);
  assert.equal(s.stats.delivered, 1);
  assert.equal(s.credits, credits - r.est.fuel + tut.reward);
  assert.ok(s.xp > 0);
  assert.equal(ship.status, 'parked');
});

test('las naves llegan adonde está el planeta (lo interceptan aunque se mueva)', () => {
  const s = newGame(3);
  const ship = s.ships[0];
  buyCargo(s, 'ferra', ship.id);
  run(s, 200, () => ship.status === 'portwork');
  assert.equal(ship.status, 'portwork');
  assert.ok(dist(ship.leg.to, position('ferra', ship.leg.t0 + ship.leg.dur)) < 0.01);
});

test('comprar carga la trae al depósito y descuenta el costo', () => {
  const s = newGame(11);
  const ship = s.ships[1];
  const credits = s.credits;
  const space = freeSpace(s);
  const r = buyCargo(s, 'kepa', ship.id);
  assert.ok(r.ok, r.reason);
  assert.equal(s.credits, credits - r.cost);
  assert.equal(freeSpace(s), space - r.tons);
  assert.ok(run(s, 400, () => !ship.job));
  assert.equal(s.stock.agua, 40 + r.tons);
  assert.equal(s.incoming.agua, 0);
});

test('con un solo muelle la segunda nave espera su turno', () => {
  const s = newGame(5);
  const [a, b] = s.ships;
  const tut = s.offers.find((o) => o.tutorial);
  const other = s.offers.find((o) => o.kind === 'order' && !o.tutorial);
  s.stock[other.cargo] += 40;
  assert.ok(acceptOffer(s, tut.id, a.id).ok);
  const r = acceptOffer(s, other.id, b.id);
  assert.ok(r.ok, r.reason);
  assert.equal(b.status, 'queued');
  assert.ok(run(s, 600, () => !a.job && !b.job));
  assert.equal(s.stats.delivered, 2);
});

test('las mejoras piden nivel y plata', () => {
  const s = newGame(1);
  assert.equal(buyUpgrade(s, 'docks').reason, 'level');
  s.credits = 100;
  assert.equal(buyUpgrade(s, 'drones').reason, 'money');
  s.credits = 1e6;
  assert.ok(buyUpgrade(s, 'drones').ok);
  assert.equal(buyShip(s, 'mula').reason, 'level');
  assert.ok(buyShip(s, 'colibri').ok);
  assert.equal(buyShip(s, 'colibri').reason, 'hangar');
});

test('con piloto automático la empresa sigue ganando sola', () => {
  const s = newGame(9);
  s.level = 3;
  s.credits = 20000;
  s.up.autopilot = 1;
  setAuto(s, s.ships[0].id, 'supply');
  setAuto(s, s.ships[1].id, 'orders');
  const before = s.stats.earned;
  const sum = fastForward(s, 1800);
  assert.ok(s.stats.delivered > 5, `entregas: ${s.stats.delivered}`);
  assert.ok(sum.earned > 0 && s.stats.earned > before);
  for (const c of Object.keys(s.stock)) assert.ok(s.stock[c] >= 0 && s.reserved[c] >= 0 && s.incoming[c] >= 0);
});

test('la estimación de entrega coincide con lo que pasa', () => {
  const s = newGame(21);
  const tut = s.offers.find((o) => o.tutorial);
  const ship = s.ships[0];
  const est = estimate(s, ship, 'order', tut);
  acceptOffer(s, tut.id, ship.id);
  let deliveredAt = null;
  run(s, 400, (st) => {
    if (st.events.some((e) => e.type === 'delivered')) deliveredAt ??= st.t;
    st.events.length = 0;
    return !ship.job;
  });
  assert.ok(Math.abs(deliveredAt - est.deliverAt) < 2.5, `${deliveredAt} vs ${est.deliverAt}`);
});

test('el estado se puede guardar y volver a cargar', () => {
  const s = newGame(4);
  acceptOffer(s, s.offers[0].id, s.ships[0].id);
  run(s, 30);
  const copy = JSON.parse(JSON.stringify({ ...s, events: [] }));
  step(s, 10);
  step(copy, 10);
  assert.equal(copy.ships[0].status, s.ships[0].status);
  assert.equal(copy.credits, s.credits);
});

test('panel del dueño: créditos, nivel máximo (un solo aviso) y todas las mejoras', async () => {
  const { ownerBoost, OWNER_CREDITS, upgradeCost } = await import('../../src/cargo/sim/sim.js');
  const { LEVELS, UPGRADE_IDS } = await import('../../src/cargo/sim/data.js');
  const s = newGame(3);
  const before = s.credits;
  assert.equal(ownerBoost(s, 'credits').ok, true);
  assert.equal(s.credits, before + OWNER_CREDITS);
  assert.equal(s.stats.earned, 0, 'los créditos regalados no cuentan como ganados');
  ownerBoost(s, 'level');
  assert.equal(s.level, LEVELS.length);
  assert.equal(s.events.filter((e) => e.type === 'level').length, 1);
  ownerBoost(s, 'upgrades');
  for (const id of UPGRADE_IDS) assert.equal(upgradeCost(s, id), null, id);
  assert.equal(ownerBoost(s, 'nada').ok, false);
  // La partida sigue andando con todo al máximo.
  run(s, 60);
});

test('naves exclusivas: piden el plano, cuestan créditos y no son más fuertes que las de fábrica', async () => {
  const { SHIPS, SHIP_CLASSES } = await import('../../src/cargo/sim/data.js');
  const s = newGame(5);
  s.credits = 1e6;
  s.level = 12;
  s.up.hangar = 2;
  assert.equal(buyShip(s, 'vencejo').reason, 'blueprint');
  assert.equal(buyShip(s, 'vencejo', new Set(['ship-raya'])).reason, 'blueprint');
  const r = buyShip(s, 'vencejo', new Set(['ship-vencejo']));
  assert.ok(r.ok);
  assert.equal(r.ship.model, 'vencejo');
  assert.equal(r.ship.evo, 0);
  assert.equal(buyShip(s, 'nada').reason, 'unknown');
  // Por clase: misma carga, y ninguna exclusiva es mejor en velocidad Y consumo a la vez que todas las demás.
  for (const c of SHIP_CLASSES) {
    const models = Object.keys(SHIPS).filter((m) => SHIPS[m].cls === c);
    assert.equal(models.length, 4, c);
    assert.equal(new Set(models.map((m) => SHIPS[m].cap)).size, 1, c);
    const base = models.find((m) => !SHIPS[m].bp);
    for (const m of models.filter((x) => SHIPS[x].bp)) {
      const better = SHIPS[m].speed > SHIPS[base].speed && SHIPS[m].fuel < SHIPS[base].fuel;
      assert.ok(!better, `${m} no puede ser más rápida y más económica que ${base}`);
      // Rendimiento (velocidad / consumo) dentro de un 15% del de fábrica.
      const k = (SHIPS[m].speed / SHIPS[m].fuel) / (SHIPS[base].speed / SHIPS[base].fuel);
      assert.ok(k > 0.85 && k < 1.15, `${m}: ${k}`);
    }
  }
});

test('evolución Mk II y Mk III: pide nivel y créditos, sube la velocidad y baja el combustible', async () => {
  const { evolveShip, evolveCost, shipSpeed, shipFuel } = await import('../../src/cargo/sim/sim.js');
  const s = newGame(6);
  const ship = s.ships[0];
  const speed0 = shipSpeed(s, ship);
  const fuel0 = shipFuel(ship);
  assert.equal(evolveShip(s, ship.id).reason, 'level');
  s.level = 3;
  s.credits = 0;
  assert.equal(evolveShip(s, ship.id).reason, 'money');
  s.credits = 1e6;
  const cost = evolveCost(s, ship).cost;
  assert.ok(evolveShip(s, ship.id).ok);
  assert.equal(s.credits, 1e6 - cost);
  assert.equal(ship.evo, 1);
  assert.ok(shipSpeed(s, ship) > speed0 && shipFuel(ship) < fuel0);
  assert.equal(evolveShip(s, ship.id).reason, 'level', 'Mk III pide nivel 6');
  s.level = 6;
  assert.ok(evolveShip(s, ship.id).ok);
  assert.equal(evolveShip(s, ship.id).reason, 'max');
  assert.equal(evolveCost(s, ship), null);
  assert.deepEqual(s.events.filter((e) => e.type === 'evolve').map((e) => e.mk), [2, 3]);
  // Las partidas viejas (sin `evo`) andan igual.
  delete s.ships[1].evo;
  assert.equal(shipSpeed(s, s.ships[1]), speed0);
  run(s, 60);
});

test('las naves blindadas cruzan el cinturón sin frenar (como con los escudos)', async () => {
  const { shipShielded } = await import('../../src/cargo/sim/sim.js');
  const s = newGame(7);
  s.level = 12;
  s.credits = 1e6;
  s.up.hangar = 2;
  const armored = buyShip(s, 'halcon', new Set(['ship-halcon'])).ship;
  const plain = buyShip(s, 'vencejo', new Set(['ship-vencejo'])).ship;
  assert.equal(shipShielded(s, armored), true);
  assert.equal(shipShielded(s, plain), false);
  s.up.shields = 1;
  assert.equal(shipShielded(s, plain), true);
});

test('panel del dueño: la flota evoluciona entera', async () => {
  const { ownerBoost } = await import('../../src/cargo/sim/sim.js');
  const s = newGame(8);
  assert.ok(ownerBoost(s, 'evolve').ok);
  assert.ok(s.ships.every((x) => x.evo === 2));
});
