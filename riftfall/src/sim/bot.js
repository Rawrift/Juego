// Piloto automático simple: esquiva enemigos y balas y recoge cristales.
// Se usa para el fondo animado del menú, para los tests y para equilibrar la dificultad.

import { DIRS, DIR_COUNT } from './sim.js';

export function botInput(s) {
  const p = s.player;
  let ax = 0;
  let ay = 0;
  for (const e of s.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    const reach = 230 + e.r * 2;
    if (d2 > reach * reach) continue;
    const w = (e.boss ? 2 : e.elite ? 2 : 1) / (d2 + 40);
    ax += dx * w;
    ay += dy * w;
  }
  // Como un jugador real, se acerca al jefe para pelearlo en lugar de huir siempre.
  if (s.boss && !s.boss.dead) {
    const dx = s.boss.x - p.x;
    const dy = s.boss.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 1;
    if (d > 300) {
      ax += (dx / d) * 0.006;
      ay += (dy / d) * 0.006;
    }
  }
  for (const b of s.ebullets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 160 * 160) continue;
    const w = 3 / (d2 + 40);
    ax += dx * w;
    ay += dy * w;
  }
  let gem = null;
  let best = 380 * 380;
  for (const o of s.pickups) {
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const d2 = dx * dx + dy * dy;
    const pri = o.kind === 'gem' ? 1 : 0.4;
    if (d2 * pri < best) {
      best = d2 * pri;
      gem = o;
    }
  }
  if (gem) {
    const dx = gem.x - p.x;
    const dy = gem.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 1;
    ax += (dx / d) * 0.004;
    ay += (dy / d) * 0.004;
  }
  // Tendencia suave a orbitar el origen para no quedar acorralado.
  ax += -p.y * 0.0000025 - p.x * 0.000002;
  ay += p.x * 0.0000025 - p.y * 0.000002;

  if (ax * ax + ay * ay < 1e-12) return 1 + (Math.floor(s.tick / 90) % DIR_COUNT);
  let bestDir = 0;
  let bestDot = -Infinity;
  for (let k = 1; k <= DIR_COUNT; k++) {
    const dot = DIRS[k][0] * ax + DIRS[k][1] * ay;
    if (dot > bestDot) {
      bestDot = dot;
      bestDir = k;
    }
  }
  return bestDir;
}

const PRIORITY = { evolve: 5, weapon: 3, passive: 2, repair: 1, cache: 0 };

export function botChoice(s) {
  let best = 0;
  let score = -1;
  s.choice.forEach((o, i) => {
    const v = PRIORITY[o.kind] * 10 + (o.level ?? 0);
    if (v > score) {
      score = v;
      best = i;
    }
  });
  return best;
}
