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
