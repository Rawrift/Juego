// Simulación determinista de RIFTFALL.
// Paso fijo de 60 ticks/s, PRNG con semilla y matemática determinista: dados la semilla, la nave
// y la lista de entradas, cualquier motor JS produce exactamente la misma partida. El servidor
// usa esto para re-jugar cada partida y calcular él mismo las recompensas (anti-trampas).

import { dsin, dcos, TAU, clamp } from './dmath.js';
import { createRng } from './rng.js';
import {
  RUN,
  SHIPS,
  WEAPONS,
  WEAPON_ORDER,
  PASSIVES,
  PASSIVE_ORDER,
  ENEMIES,
  ENEMY_ORDER,
  BASE_STATS,
  xpToNext,
  shipYield,
  weaponStats
} from './content.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const MAX_TICKS = RUN.durationSec * TICK_RATE;
export const DIR_COUNT = 32;

/** DIRS[0] = quieto; DIRS[k] (k = 1..32) = dirección (k-1) * 360/32 grados. */
export const DIRS = [[0, 0]];
for (let k = 0; k < DIR_COUNT; k++) {
  const a = (k * TAU) / DIR_COUNT;
  DIRS.push([dcos(a), dsin(a)]);
}

const CELL = 64;
const GRID_N = 50;
const GRID_HALF = (GRID_N * CELL) / 2;
const MAX_ENEMY_R = 52;
const MAX_GEMS = 300;

// ------------------------------------------------------------------- creación

export function createSim({ seed, ship = 'spark', shipLevel = 1 } = {}) {
  const shipKey = SHIPS[ship] ? ship : 'spark';
  const s = {
    seed: seed >>> 0,
    rng: createRng(seed >>> 0),
    tick: 0,
    phase: 'running',
    shipKey,
    shipLevel: shipKey === 'spark' ? 1 : clamp(shipLevel | 0, 1, 10),
    player: {
      x: 0, y: 0, px: 0, py: 0, fx: 1, fy: 0, r: 15,
      hp: 0, invuln: 0, level: 1, xp: 0, xpNext: xpToNext(1),
      stats: null, weapons: [], passives: [], moving: false
    },
    enemies: [],
    projectiles: [],
    ebullets: [],
    pickups: [],
    spawnQueue: [],
    kills: 0,
    shards: 0,
    bossesKilled: 0,
    elitesKilled: 0,
    damageTaken: 0,
    spawnAcc: 0,
    nextElite: RUN.eliteEverySec * TICK_RATE,
    bossIdx: 0,
    swarmIdx: 0,
    boss: null,
    choice: null,
    pendingLevels: 0,
    pendingChests: 0,
    choiceSource: null,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    gemCount: 0,
    nextId: 1,
    events: [],
    grid: { head: new Int32Array(GRID_N * GRID_N), next: new Int32Array(1024), ox: 0, oy: 0 },
    qbuf: new Int32Array(8192)
  };
  addWeapon(s, SHIPS[shipKey].weapon);
  recomputeStats(s);
  s.player.hp = s.player.stats.maxHp;
  return s;
}

function addWeapon(s, id) {
  s.player.weapons.push({ id, level: 1, evolved: false, cd: 20, angle: 0, radius: 0, count: 0 });
}

function recomputeStats(s) {
  const ship = SHIPS[s.shipKey];
  const st = { ...BASE_STATS };
  st.maxHp *= ship.hp;
  st.speed *= ship.speed;
  st.might = st.might * ship.might + 0.02 * (s.shipLevel - 1);
  st.crit += ship.crit;
  st.cooldown *= ship.cooldown;
  for (const p of s.player.passives) PASSIVES[p.id].apply(st, p.level);
  const old = s.player.stats;
  if (old && st.maxHp > old.maxHp) s.player.hp += st.maxHp - old.maxHp;
  s.player.stats = st;
}

// ------------------------------------------------------------------- paso

/** Avanza un tick. `dir` es 0 (quieto) o 1..32 (dirección). Solo válido en fase 'running'. */
export function stepSim(s, dir) {
  if (s.phase !== 'running') return;
  s.tick++;
  if (s.comboTimer > 0 && --s.comboTimer === 0) s.combo = 0;
  movePlayer(s, dir);
  director(s);
  updateEnemies(s);
  buildGrid(s);
  separate(s);
  updateWeapons(s);
  updateProjectiles(s);
  updateEnemyBullets(s);
  contactDamage(s);
  cleanupEnemies(s);
  updatePickups(s);

  const p = s.player;
  if (p.hp <= 0) {
    p.hp = 0;
    s.phase = 'dead';
    s.events.push({ t: 'dead', x: p.x, y: p.y });
  } else if (s.tick >= MAX_TICKS) {
    s.phase = 'victory';
    s.events.push({ t: 'victory' });
  } else if (s.pendingLevels > 0 || s.pendingChests > 0) {
    openChoice(s);
  }
}

function movePlayer(s, dir) {
  const p = s.player;
  const d = DIRS[dir | 0] ?? DIRS[0];
  p.px = p.x;
  p.py = p.y;
  p.moving = dir > 0 && dir <= DIR_COUNT;
  if (p.moving) {
    p.x += d[0] * p.stats.speed * DT;
    p.y += d[1] * p.stats.speed * DT;
    p.fx = d[0];
    p.fy = d[1];
  }
  if (p.invuln > 0) p.invuln--;
  if (p.stats.regen > 0) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * DT);
}

// ------------------------------------------------------------------- director de oleadas

function director(s) {
  const t = s.tick / TICK_RATE;
  const p = s.player;

  if (s.bossIdx < RUN.bossTimes.length) {
    const bt = RUN.bossTimes[s.bossIdx] * TICK_RATE;
    if (s.tick === bt - 180) s.events.push({ t: 'warning', kind: 'boss' });
    if (s.tick === bt) {
      const a = s.rng.next() * TAU;
      const e = spawnEnemy(s, 'warden', p.x + dcos(a) * 620, p.y + dsin(a) * 620, false);
      s.boss = e;
      s.bossIdx++;
      s.events.push({ t: 'boss', n: s.bossIdx });
    }
  }

  if (s.swarmIdx < RUN.swarmTimes.length && s.tick === RUN.swarmTimes[s.swarmIdx] * TICK_RATE) {
    const n = 30 + s.swarmIdx * 12;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      spawnEnemy(s, s.swarmIdx === 2 ? 'drone' : 'mite', p.x + dcos(a) * 560, p.y + dsin(a) * 560, false);
    }
    s.swarmIdx++;
    s.events.push({ t: 'warning', kind: 'swarm' });
  }

  if (s.tick >= s.nextElite) {
    s.nextElite += RUN.eliteEverySec * TICK_RATE;
    spawnAtEdge(s, pickKind(s, t, true), true);
  }

  const target = Math.min(RUN.maxEnemies, Math.floor(16 + t * 0.62));
  s.spawnAcc += (2.4 + t * 0.052) * DT;
  while (s.spawnAcc >= 1) {
    s.spawnAcc -= 1;
    if (s.enemies.length >= target) continue;
    const eliteChance = t > 60 ? 0.003 + (t / 600) * 0.01 : 0;
    spawnAtEdge(s, pickKind(s, t, false), s.rng.next() < eliteChance);
  }
}

function pickKind(s, t, noMite) {
  let total = 0;
  for (const k of ENEMY_ORDER) {
    const d = ENEMIES[k];
    if (d.from <= t && !(noMite && k === 'mite')) total += d.weight;
  }
  let r = s.rng.next() * total;
  for (const k of ENEMY_ORDER) {
    const d = ENEMIES[k];
    if (d.from > t || (noMite && k === 'mite')) continue;
    r -= d.weight;
    if (r <= 0) return k;
  }
  return 'drone';
}

function spawnAtEdge(s, kind, elite) {
  const a = s.rng.next() * TAU;
  const rad = RUN.spawnRadiusMin + s.rng.next() * (RUN.spawnRadiusMax - RUN.spawnRadiusMin);
  spawnEnemy(s, kind, s.player.x + dcos(a) * rad, s.player.y + dsin(a) * rad, elite);
}

function spawnEnemy(s, kind, x, y, elite) {
  const def = ENEMIES[kind];
  const t = s.tick / TICK_RATE;
  let hp = def.hp * (1 + t / 95);
  if (elite) hp *= 9;
  if (def.boss) hp = def.hp * (1 + s.bossIdx * 1.8) * (1 + t / 300);
  const e = {
    id: s.nextId++,
    kind,
    def,
    x, y, px: x, py: y, kx: 0, ky: 0,
    hp,
    maxHp: hp,
    r: def.r * (elite ? 1.6 : 1),
    speed: def.speed * (1 + t / 900) * (elite ? 0.9 : 1),
    dmg: def.dmg * (1 + t / 260) * (elite ? 1.5 : 1),
    xp: def.xp * (elite ? 6 : 1),
    elite,
    boss: !!def.boss,
    dead: false,
    flash: 0,
    orbitCd: 0,
    mode: 0,
    timer: def.ai === 'ranged' ? 60 + s.rng.int(60) : def.ai === 'boss' ? 150 : 50,
    pattern: 0,
    ax: 0,
    ay: 0
  };
  s.enemies.push(e);
  return e;
}

// ------------------------------------------------------------------- enemigos

function updateEnemies(s) {
  const p = s.player;
  const en = s.enemies;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (e.dead) continue;
    e.px = e.x;
    e.py = e.y;
    if (e.flash > 0) e.flash--;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    let vx = 0;
    let vy = 0;
    switch (e.def.ai) {
      case 'chase':
        vx = nx * e.speed;
        vy = ny * e.speed;
        break;
      case 'dash':
        if (e.mode === 0) {
          vx = nx * e.speed;
          vy = ny * e.speed;
          e.timer--;
          if (e.timer <= 0 && d < 330) {
            e.mode = 1;
            e.timer = 38;
            e.ax = nx;
            e.ay = ny;
          }
        } else if (e.mode === 1) {
          vx = -e.ax * 24;
          vy = -e.ay * 24;
          if (--e.timer <= 0) {
            e.mode = 2;
            e.timer = 26;
          }
        } else {
          vx = e.ax * e.def.dashSpeed;
          vy = e.ay * e.def.dashSpeed;
          if (--e.timer <= 0) {
            e.mode = 0;
            e.timer = 110;
          }
        }
        break;
      case 'ranged':
        if (d > 330) {
          vx = nx * e.speed;
          vy = ny * e.speed;
        } else if (d < 230) {
          vx = -nx * e.speed;
          vy = -ny * e.speed;
        } else {
          vx = -ny * e.speed * 0.6;
          vy = nx * e.speed * 0.6;
        }
        if (--e.timer <= 0 && d < 560) {
          e.timer = 130;
          fireEnemyBullet(s, e.x, e.y, nx, ny, e.def.bulletSpeed, e.dmg * 0.9, 7);
        }
        break;
      case 'boss': {
        const v = bossAI(s, e, nx, ny);
        vx = v[0];
        vy = v[1];
        break;
      }
    }
    e.x += (vx + e.kx) * DT;
    e.y += (vy + e.ky) * DT;
    e.kx *= 0.86;
    e.ky *= 0.86;
    if (!e.boss && d > RUN.despawnRadius) {
      e.x = p.x + nx * 820;
      e.y = p.y + ny * 820;
      e.px = e.x;
      e.py = e.y;
    }
  }
}

const BOSS_V = [0, 0];
function bossAI(s, e, nx, ny) {
  e.timer--;
  if (e.mode === 0) {
    BOSS_V[0] = nx * e.speed;
    BOSS_V[1] = ny * e.speed;
    if (e.timer <= 0) {
      e.pattern = (e.pattern + 1) % 4;
      e.mode = 1;
      e.timer = 48;
      s.events.push({ t: 'telegraph', id: e.id, pattern: e.pattern });
    }
    return BOSS_V;
  }
  if (e.mode === 1) {
    BOSS_V[0] = nx * e.speed * 0.15;
    BOSS_V[1] = ny * e.speed * 0.15;
    if (e.timer <= 0) {
      const tier = s.bossIdx;
      if (e.pattern === 0) {
        const n = 16 + tier * 4;
        const off = s.tick * 0.13;
        for (let i = 0; i < n; i++) {
          const a = off + (i * TAU) / n;
          fireEnemyBullet(s, e.x, e.y, dcos(a), dsin(a), 190 + tier * 15, e.dmg * 0.6, 9);
        }
      } else if (e.pattern === 1) {
        for (let i = 0; i < 6 + tier * 2; i++) {
          const a = (i * TAU) / (6 + tier * 2);
          spawnEnemy(s, tier >= 3 ? 'drone' : 'mite', e.x + dcos(a) * 90, e.y + dsin(a) * 90, false);
        }
      } else if (e.pattern === 2) {
        const n = 5 + tier * 2;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.16;
          const c = dcos(off);
          const sn = dsin(off);
          fireEnemyBullet(s, e.x, e.y, nx * c - ny * sn, nx * sn + ny * c, 270, e.dmg * 0.6, 8);
        }
      } else {
        e.mode = 2;
        e.timer = 40;
        e.ax = nx;
        e.ay = ny;
        return BOSS_V;
      }
      e.mode = 0;
      e.timer = 130 - tier * 10;
    }
    return BOSS_V;
  }
  BOSS_V[0] = e.ax * 430;
  BOSS_V[1] = e.ay * 430;
  if (e.timer <= 0) {
    e.mode = 0;
    e.timer = 130;
  }
  return BOSS_V;
}

function fireEnemyBullet(s, x, y, dx, dy, speed, dmg, r) {
  s.ebullets.push({ x, y, px: x, py: y, vx: dx * speed, vy: dy * speed, dmg, r, life: 300 });
}

// ------------------------------------------------------------------- grilla espacial

function buildGrid(s) {
  const g = s.grid;
  const en = s.enemies;
  g.ox = s.player.x - GRID_HALF;
  g.oy = s.player.y - GRID_HALF;
  g.head.fill(-1);
  if (g.next.length < en.length) g.next = new Int32Array(en.length * 2);
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (e.dead) continue;
    const c = cellOf(g.oy, e.y) * GRID_N + cellOf(g.ox, e.x);
    g.next[i] = g.head[c];
    g.head[c] = i;
  }
}

function cellOf(origin, v) {
  const c = Math.floor((v - origin) / CELL);
  return c < 0 ? 0 : c >= GRID_N ? GRID_N - 1 : c;
}

/** Llena s.qbuf con los índices de enemigos en las celdas que tocan el círculo. Devuelve cuántos. */
function query(s, x, y, radius) {
  const g = s.grid;
  const x0 = cellOf(g.ox, x - radius);
  const x1 = cellOf(g.ox, x + radius);
  const y0 = cellOf(g.oy, y - radius);
  const y1 = cellOf(g.oy, y + radius);
  const buf = s.qbuf;
  let n = 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (let i = g.head[cy * GRID_N + cx]; i !== -1; i = g.next[i]) {
        if (n < buf.length) buf[n++] = i;
      }
    }
  }
  return n;
}

function separate(s) {
  const en = s.enemies;
  const buf = s.qbuf;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (e.dead) continue;
    // Cada enemigo solo se empuja a sí mismo, y cada uno se procesa en ticks alternos:
    // mitad de coste y resultado visualmente igual.
    if ((i + s.tick) & 1) continue;
    const n = query(s, e.x, e.y, e.r + MAX_ENEMY_R);
    const me = e.r * e.r;
    for (let k = 0; k < n; k++) {
      const j = buf[k];
      if (j === i) continue;
      const o = en[j];
      if (o.dead) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const rr = e.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const mo = o.r * o.r;
      const push = (((rr - d) * 0.8) / d) * (mo / (me + mo));
      e.x -= dx * push;
      e.y -= dy * push;
    }
  }
}

function nearestEnemy(s, x, y, maxDist, exclude) {
  const en = s.enemies;
  let best = null;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD && !(exclude && exclude.includes(e.id))) {
      bestD = d2;
      best = e;
    }
  }
  return best;
}

// ------------------------------------------------------------------- daño

function damageEnemy(s, e, base, kx, ky, kb) {
  if (e.dead) return;
  const st = s.player.stats;
  let dmg = base * st.might;
  const crit = s.rng.next() < st.crit;
  if (crit) dmg *= 2;
  dmg = Math.floor(dmg + 0.5);
  e.hp -= dmg;
  e.flash = 5;
  if (kb) {
    const res = e.def.kbResist ?? 1;
    e.kx += kx * kb * res;
    e.ky += ky * kb * res;
  }
  s.events.push({ t: 'hit', x: e.x, y: e.y, v: dmg, c: crit });
  if (e.hp <= 0) killEnemy(s, e);
}

function killEnemy(s, e) {
  e.dead = true;
  s.kills++;
  s.combo = s.comboTimer > 0 ? s.combo + 1 : 1;
  s.comboTimer = 90;
  if (s.combo > s.bestCombo) s.bestCombo = s.combo;
  if (s.combo === 50 || s.combo % 100 === 0) s.events.push({ t: 'combo', n: s.combo });
  if (e.elite) s.elitesKilled++;
  s.events.push({ t: 'kill', x: e.x, y: e.y, kind: e.kind, elite: e.elite, boss: e.boss, r: e.r });
  if (e.def.split) {
    for (let i = 0; i < e.def.split; i++) {
      const a = (i * TAU) / e.def.split;
      s.spawnQueue.push(['mite', e.x + dcos(a) * 16, e.y + dsin(a) * 16]);
    }
  }
  if (e.boss) {
    s.bossesKilled++;
    if (s.boss === e) s.boss = null;
    s.events.push({ t: 'bossDead', x: e.x, y: e.y });
  }
  dropLoot(s, e);
}

function dropLoot(s, e) {
  const luck = s.player.stats.shardLuck;
  spawnGem(s, e.x, e.y, e.xp);
  if (e.boss) {
    addPickup(s, 'shard', e.x + 20, e.y, 50 + 25 * s.bossesKilled);
    addPickup(s, 'heal', e.x - 20, e.y, 1);
    addPickup(s, 'magnet', e.x, e.y + 20, 1);
    addPickup(s, 'chest', e.x, e.y - 26, 1).mag = true; // el cofre vuela hacia la nave
    return;
  }
  if (e.elite) {
    addPickup(s, 'shard', e.x, e.y, 4 + s.rng.int(6));
    if (s.rng.next() < 0.35) addPickup(s, 'heal', e.x + 12, e.y, 1);
    return;
  }
  if (s.rng.next() < 0.007 * luck) addPickup(s, 'shard', e.x, e.y, 1);
  const r = s.rng.next();
  if (r < 0.0035) addPickup(s, 'heal', e.x, e.y, 1);
  else if (r < 0.0047) addPickup(s, 'magnet', e.x, e.y, 1);
  else if (r < 0.0057) addPickup(s, 'bomb', e.x, e.y, 1);
}

function spawnGem(s, x, y, value) {
  if (s.gemCount >= MAX_GEMS) {
    for (const pk of s.pickups) {
      if (pk.kind === 'gem') {
        pk.value += value;
        return;
      }
    }
  }
  s.gemCount++;
  addPickup(s, 'gem', x, y, value);
}

function addPickup(s, kind, x, y, value) {
  const o = { id: s.nextId++, kind, x, y, px: x, py: y, value, mag: false, spd: 0 };
  s.pickups.push(o);
  return o;
}

function hurtPlayer(s, amount) {
  const p = s.player;
  if (p.invuln > 0) return false;
  const dmg = Math.max(1, amount - p.stats.armor);
  p.hp -= dmg;
  p.invuln = 30;
  s.damageTaken += dmg;
  s.events.push({ t: 'hurt', v: dmg });
  return true;
}

// ------------------------------------------------------------------- armas

function updateWeapons(s) {
  const st = s.player.stats;
  for (const w of s.player.weapons) {
    const L = weaponStats(w);
    if (w.id === 'orbit') {
      orbitTick(s, w, L);
      continue;
    }
    if (--w.cd > 0) continue;
    let fired = false;
    if (w.id === 'blaster') fired = fireBlaster(s, L);
    else if (w.id === 'arc') fired = fireArc(s, L);
    else if (w.id === 'nova') fired = fireNova(s, L);
    else if (w.id === 'missile') fired = fireMissiles(s, L);
    else if (w.id === 'lance') fired = fireLance(s, L);
    w.cd = fired ? Math.max(6, Math.round(L.cd * st.cooldown)) : 6;
  }
}

function fireBlaster(s, L) {
  const p = s.player;
  const target = nearestEnemy(s, p.x, p.y, 720);
  if (!target) return false;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
  const nx = dx / d;
  const ny = dy / d;
  const count = L.count + p.stats.amount;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 0.13;
    const c = dcos(off);
    const sn = dsin(off);
    const vx = nx * c - ny * sn;
    const vy = nx * sn + ny * c;
    s.projectiles.push({
      kind: 'bolt', x: p.x, y: p.y, px: p.x, py: p.y, vx: vx * 660, vy: vy * 660,
      dmg: L.dmg, r: 6, life: 70, pierce: L.pierce, hits: [], target: null, splash: 0
    });
  }
  s.events.push({ t: 'shot', w: 'blaster' });
  return true;
}

function orbitTick(s, w, L) {
  const p = s.player;
  const count = L.count + p.stats.amount;
  const radius = L.radius * p.stats.area;
  w.angle = (s.tick * L.speed) / TICK_RATE;
  w.radius = radius;
  w.count = count;
  const buf = s.qbuf;
  for (let b = 0; b < count; b++) {
    const a = w.angle + (b * TAU) / count;
    const bx = p.x + dcos(a) * radius;
    const by = p.y + dsin(a) * radius;
    const n = query(s, bx, by, 14 + MAX_ENEMY_R);
    for (let k = 0; k < n; k++) {
      const e = s.enemies[buf[k]];
      if (e.dead || e.orbitCd > s.tick) continue;
      const dx = e.x - bx;
      const dy = e.y - by;
      const rr = e.r + 14;
      if (dx * dx + dy * dy > rr * rr) continue;
      e.orbitCd = s.tick + L.hitCd;
      const ex = e.x - p.x;
      const ey = e.y - p.y;
      const d = Math.sqrt(ex * ex + ey * ey) + 0.0001;
      damageEnemy(s, e, L.dmg, ex / d, ey / d, 140);
    }
  }
}

function fireArc(s, L) {
  const p = s.player;
  const first = nearestEnemy(s, p.x, p.y, 400);
  if (!first) return false;
  const hit = [first.id];
  const pts = [p.x, p.y, first.x, first.y];
  let cur = first;
  damageEnemy(s, first, L.dmg, 0, 0, 0);
  const jump = 175 * s.player.stats.area;
  for (let k = 1; k < L.chains + s.player.stats.amount; k++) {
    const nxt = nearestEnemy(s, cur.x, cur.y, jump, hit);
    if (!nxt) break;
    hit.push(nxt.id);
    pts.push(nxt.x, nxt.y);
    damageEnemy(s, nxt, L.dmg, 0, 0, 0);
    cur = nxt;
  }
  s.events.push({ t: 'arc', pts });
  return true;
}

function fireNova(s, L) {
  const p = s.player;
  const R = L.radius * p.stats.area;
  const n = query(s, p.x, p.y, R + MAX_ENEMY_R);
  const buf = s.qbuf;
  const targets = [];
  for (let k = 0; k < n; k++) targets.push(buf[k]);
  for (const i of targets) {
    const e = s.enemies[i];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
    if (d > R + e.r) continue;
    damageEnemy(s, e, L.dmg, dx / d, dy / d, L.kb);
  }
  s.events.push({ t: 'nova', x: p.x, y: p.y, r: R });
  return true;
}

function fireMissiles(s, L) {
  const p = s.player;
  const target = nearestEnemy(s, p.x, p.y, 700);
  if (!target) return false;
  const count = L.count + p.stats.amount;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 0.7;
    const c = dcos(off);
    const sn = dsin(off);
    const vx = p.fx * c - p.fy * sn;
    const vy = p.fx * sn + p.fy * c;
    s.projectiles.push({
      kind: 'missile', x: p.x, y: p.y, px: p.x, py: p.y, vx: vx * 240, vy: vy * 240,
      dmg: L.dmg, r: 8, life: 180, pierce: 0, hits: null, target, splash: L.splash * p.stats.area
    });
  }
  s.events.push({ t: 'shot', w: 'missile' });
  return true;
}

function fireLance(s, L) {
  const p = s.player;
  if (!nearestEnemy(s, p.x, p.y, L.length)) return false;
  const width = L.width * p.stats.area;
  const dirs = L.back ? [1, -1] : [1];
  for (const sign of dirs) {
    const fx = p.fx * sign;
    const fy = p.fy * sign;
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      if (e.dead) continue;
      const rx = e.x - p.x;
      const ry = e.y - p.y;
      const along = rx * fx + ry * fy;
      if (along < -e.r || along > L.length + e.r) continue;
      const perp = rx * fy - ry * fx;
      const lim = width / 2 + e.r;
      if (perp > lim || perp < -lim) continue;
      damageEnemy(s, e, L.dmg, fx, fy, 160);
    }
    s.events.push({ t: 'lance', x: p.x, y: p.y, fx, fy, len: L.length, w: width });
  }
  return true;
}

function explode(s, b) {
  const R = b.splash;
  const n = query(s, b.x, b.y, R + MAX_ENEMY_R);
  const targets = [];
  for (let k = 0; k < n; k++) targets.push(s.qbuf[k]);
  for (const i of targets) {
    const e = s.enemies[i];
    if (e.dead) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
    if (d > R + e.r) continue;
    damageEnemy(s, e, b.dmg, dx / d, dy / d, 180);
  }
  s.events.push({ t: 'explode', x: b.x, y: b.y, r: R });
}

function updateProjectiles(s) {
  const pr = s.projectiles;
  const buf = s.qbuf;
  let w = 0;
  for (let i = 0; i < pr.length; i++) {
    const b = pr[i];
    b.px = b.x;
    b.py = b.y;
    if (b.kind === 'missile') {
      if (!b.target || b.target.dead) {
        b.target = (s.tick + i) % 6 === 0 ? nearestEnemy(s, b.x, b.y, 650) : null;
      }
      if (b.target) {
        const dx = b.target.x - b.x;
        const dy = b.target.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.0001;
        b.vx += ((dx / d) * 440 - b.vx) * 0.09;
        b.vy += ((dy / d) * 440 - b.vy) * 0.09;
      }
    }
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life--;
    const n = query(s, b.x, b.y, b.r + MAX_ENEMY_R);
    for (let k = 0; k < n && b.life > 0; k++) {
      const e = s.enemies[buf[k]];
      if (e.dead) continue;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (b.kind === 'bolt') {
        if (b.hits.includes(e.id)) continue;
        b.hits.push(e.id);
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) + 0.0001;
        damageEnemy(s, e, b.dmg, b.vx / sp, b.vy / sp, 90);
        if (b.pierce-- <= 0) b.life = 0;
      } else {
        explode(s, b);
        b.life = -1;
      }
    }
    if (b.life === 0 && b.kind === 'missile') explode(s, b);
    if (b.life > 0) pr[w++] = b;
  }
  pr.length = w;
}

function updateEnemyBullets(s) {
  const p = s.player;
  const eb = s.ebullets;
  let w = 0;
  for (let i = 0; i < eb.length; i++) {
    const b = eb[i];
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life--;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const rr = b.r + p.r - 3;
    if (dx * dx + dy * dy < rr * rr && p.invuln <= 0) {
      hurtPlayer(s, b.dmg);
      b.life = 0;
    }
    if (b.life > 0) eb[w++] = b;
  }
  eb.length = w;
}

function contactDamage(s) {
  const p = s.player;
  if (p.invuln > 0) return;
  const n = query(s, p.x, p.y, p.r + MAX_ENEMY_R);
  for (let k = 0; k < n; k++) {
    const e = s.enemies[s.qbuf[k]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = e.r + p.r - 4;
    if (dx * dx + dy * dy < rr * rr) {
      hurtPlayer(s, e.dmg);
      return;
    }
  }
}

function cleanupEnemies(s) {
  const en = s.enemies;
  let w = 0;
  for (let i = 0; i < en.length; i++) if (!en[i].dead) en[w++] = en[i];
  en.length = w;
  for (const [kind, x, y] of s.spawnQueue) spawnEnemy(s, kind, x, y, false);
  s.spawnQueue.length = 0;
}

// ------------------------------------------------------------------- pickups

function updatePickups(s) {
  const p = s.player;
  const st = p.stats;
  const mag2 = st.magnet * st.magnet;
  const pk = s.pickups;
  let w = 0;
  for (let i = 0; i < pk.length; i++) {
    const o = pk[i];
    o.px = o.x;
    o.py = o.y;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (!o.mag && d2 < mag2) o.mag = true;
    let keep = true;
    if (o.mag) {
      const d = Math.sqrt(d2) + 0.0001;
      o.spd = Math.min(980, o.spd + 24);
      const step = Math.min(d, o.spd * DT);
      o.x += (dx / d) * step;
      o.y += (dy / d) * step;
      if (d < p.r + 12) {
        collect(s, o);
        keep = false;
      }
    }
    if (keep) pk[w++] = o;
  }
  pk.length = w;
}

function collect(s, o) {
  const p = s.player;
  s.events.push({ t: 'pickup', kind: o.kind, v: o.value });
  if (o.kind === 'gem') {
    s.gemCount--;
    p.xp += o.value * p.stats.xpGain;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpToNext(p.level);
      s.pendingLevels++;
    }
  } else if (o.kind === 'shard') {
    s.shards += o.value;
  } else if (o.kind === 'chest') {
    s.pendingChests++;
  } else if (o.kind === 'heal') {
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.3);
  } else if (o.kind === 'magnet') {
    for (const q of s.pickups) if (q.kind === 'gem') q.mag = true;
  } else if (o.kind === 'bomb') {
    const t = s.tick / TICK_RATE;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy > 900 * 900) continue;
      damageEnemy(s, e, e.boss ? e.maxHp * 0.04 : 60 + t * 1.5, 0, 0, 0);
    }
    s.events.push({ t: 'bomb', x: p.x, y: p.y });
  }
}

// ------------------------------------------------------------------- subida de nivel

function openChoice(s) {
  const p = s.player;
  const chest = s.pendingChests > 0;
  const evos = [];
  for (const w of p.weapons) {
    const evo = WEAPONS[w.id].evo;
    if (!w.evolved && w.level >= 5 && p.passives.some((x) => x.id === evo.passive)) {
      evos.push({ kind: 'evolve', id: w.id, level: 6, wgt: 4 });
    }
  }
  const cands = [...evos];
  for (const w of p.weapons) if (w.level < 5) cands.push({ kind: 'weapon', id: w.id, level: w.level + 1, wgt: 1.3 });
  if (p.weapons.length < RUN.weaponSlots) {
    for (const id of WEAPON_ORDER) {
      if (!p.weapons.some((w) => w.id === id)) cands.push({ kind: 'weapon', id, level: 1, wgt: 1 });
    }
  }
  for (const ps of p.passives) {
    if (ps.level < PASSIVES[ps.id].max) cands.push({ kind: 'passive', id: ps.id, level: ps.level + 1, wgt: 1.1 });
  }
  if (p.passives.length < RUN.passiveSlots) {
    for (const id of PASSIVE_ORDER) {
      if (!p.passives.some((x) => x.id === id)) cands.push({ kind: 'passive', id, level: 1, wgt: 0.8 });
    }
  }
  const picked = [];
  if (chest && evos.length) {
    // El cofre del Guardián garantiza una evolución si hay alguna disponible.
    const [c] = cands.splice(0, 1);
    picked.push({ kind: c.kind, id: c.id, level: c.level });
  }
  while (picked.length < 3 && cands.length > 0) {
    let total = 0;
    for (const c of cands) total += c.wgt;
    let r = s.rng.next() * total;
    let idx = cands.length - 1;
    for (let i = 0; i < cands.length; i++) {
      r -= cands[i].wgt;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    const [c] = cands.splice(idx, 1);
    picked.push({ kind: c.kind, id: c.id, level: c.level });
  }
  if (picked.length < 3) picked.push({ kind: 'repair', id: 'repair', level: 0 });
  if (picked.length < 3) picked.push({ kind: 'cache', id: 'cache', level: 0 });
  s.choice = picked;
  s.choiceSource = chest ? 'chest' : 'level';
  s.phase = 'choice';
  s.events.push({ t: chest ? 'chest' : 'levelup', level: p.level });
}

/** Aplica la opción elegida (0..2) cuando la fase es 'choice'. */
export function chooseUpgrade(s, index) {
  if (s.phase !== 'choice' || !s.choice) return false;
  const o = s.choice[index | 0];
  if (!o) return false;
  const p = s.player;
  if (o.kind === 'weapon') {
    const w = p.weapons.find((x) => x.id === o.id);
    if (w) w.level++;
    else addWeapon(s, o.id);
  } else if (o.kind === 'evolve') {
    const w = p.weapons.find((x) => x.id === o.id);
    if (w) w.evolved = true;
    s.events.push({ t: 'evolve', id: o.id });
  } else if (o.kind === 'passive') {
    const ps = p.passives.find((x) => x.id === o.id);
    if (ps) ps.level++;
    else p.passives.push({ id: o.id, level: 1 });
    recomputeStats(s);
  } else if (o.kind === 'repair') {
    p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.4);
  } else if (o.kind === 'cache') {
    s.shards += 2;
  }
  s.choice = null;
  if (s.choiceSource === 'chest') s.pendingChests--;
  else s.pendingLevels--;
  s.choiceSource = null;
  s.phase = 'running';
  if (s.pendingLevels > 0 || s.pendingChests > 0) openChoice(s);
  return true;
}

// ------------------------------------------------------------------- resultados

export function summarize(s) {
  const timeSec = Math.floor(s.tick / TICK_RATE);
  const victory = s.phase === 'victory';
  const base = s.shards + Math.floor(timeSec / 30) * 3 + (victory ? 150 : 0);
  const mult = shipYield(s.shipKey, s.shipLevel);
  return {
    ticks: s.tick,
    timeSec,
    victory,
    kills: s.kills,
    level: s.player.level,
    bossesKilled: s.bossesKilled,
    elitesKilled: s.elitesKilled,
    shardsCollected: s.shards,
    shardsEarned: Math.floor(base * mult),
    yieldMult: mult,
    bestCombo: s.bestCombo,
    score: s.kills + timeSec * 2 + s.player.level * 25 + s.bossesKilled * 500 + Math.floor(s.bestCombo / 2) + (victory ? 2000 : 0)
  };
}

/** Huella del estado para comparar simulaciones (tests de determinismo). */
export function stateHash(s) {
  let h = 0x811c9dc5;
  const mix = (v) => {
    const str = String(v);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  const p = s.player;
  mix(s.tick); mix(p.x); mix(p.y); mix(p.hp); mix(s.kills); mix(s.shards); mix(p.level); mix(p.xp);
  for (const e of s.enemies) { mix(e.id); mix(e.x); mix(e.y); mix(e.hp); }
  for (const b of s.projectiles) { mix(b.x); mix(b.y); }
  return (h >>> 0).toString(16);
}
