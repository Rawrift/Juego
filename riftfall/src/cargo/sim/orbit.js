// Movimiento de los planetas y cálculo de rutas. Todo gira alrededor del sol (0, 0) en el plano XZ.
// Como los planetas se mueven, la nave apunta adonde VA a estar su destino cuando llegue.

import { PORTS, BELT } from './data.js';

export function position(id, t) {
  const p = PORTS[id];
  const a = p.phase + (t / p.period) * Math.PI * 2;
  return { x: Math.cos(a) * p.orbit, z: Math.sin(a) * p.orbit };
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Parte del tramo a→b que pasa por el cinturón de asteroides (0 a 1). */
export function beltFraction(a, b) {
  const n = 24;
  let inside = 0;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const r = Math.hypot(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
    if (r >= BELT.inner && r <= BELT.outer) inside++;
  }
  return inside / n;
}

/** Segundos de viaje en línea recta de a hasta b. */
export function legTime(a, b, speed, shields) {
  const d = dist(a, b);
  const f = shields ? 0 : beltFraction(a, b);
  return (d / speed) * (1 - f + f / BELT.slow);
}

/**
 * Ruta desde el punto `from` (en el instante t0) hasta el lugar `to`.
 * Devuelve { time, point }: la duración y el punto de encuentro.
 */
export function intercept(from, to, t0, speed, shields) {
  let time = legTime(from, position(to, t0), speed, shields);
  let point = position(to, t0 + time);
  for (let i = 0; i < 12; i++) {
    time = legTime(from, point, speed, shields);
    point = position(to, t0 + time);
  }
  return { time, point };
}

/** Distancia promedio entre dos órbitas (para fijar precios justos). */
const avgCache = new Map();
export function avgDistance(a, b) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (!avgCache.has(key)) {
    const r1 = PORTS[a].orbit;
    const r2 = PORTS[b].orbit;
    let s = 0;
    const n = 90;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) / n) * Math.PI;
      s += Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(th));
    }
    avgCache.set(key, s / n);
  }
  return avgCache.get(key);
}
