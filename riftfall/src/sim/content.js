// Contenido del juego: naves, armas, mejoras pasivas, enemigos y ritmo de la partida.
// Compartido por el cliente (render/UI) y el servidor (verificación por replay).

export const RUN = {
  durationSec: 600,
  maxEnemies: 380,
  bossTimes: [180, 360, 540],
  swarmTimes: [120, 300, 450],
  eliteEverySec: 40,
  spawnRadiusMin: 760,
  spawnRadiusMax: 880,
  despawnRadius: 1500,
  weaponSlots: 5,
  passiveSlots: 5
};

/**
 * Naves. `classId` coincide con el índice de clase del contrato RiftShips (-1 = nave gratuita).
 * `yield` es el bonus de Shards al final de la partida; el nivel de forja suma +3% por nivel.
 */
export const SHIPS = {
  spark: {
    classId: -1,
    name: 'SPARK',
    tier: 'Gratis',
    color: '#4de8ff',
    weapon: 'blaster',
    hp: 1,
    speed: 1,
    might: 1,
    crit: 0,
    cooldown: 1,
    yield: 0,
    desc: 'Interceptor de serie. Equilibrado y fiable.'
  },
  vanguard: {
    classId: 0,
    name: 'VANGUARD',
    tier: 'Común',
    color: '#4dff9a',
    weapon: 'nova',
    hp: 1.25,
    speed: 0.97,
    might: 1,
    crit: 0,
    cooldown: 1,
    yield: 0.1,
    desc: 'Casco reforzado. Empieza con Nova Pulse.'
  },
  phantom: {
    classId: 1,
    name: 'PHANTOM',
    tier: 'Rara',
    color: '#b36bff',
    weapon: 'orbit',
    hp: 0.9,
    speed: 1.14,
    might: 1,
    crit: 0.08,
    cooldown: 1,
    yield: 0.2,
    desc: 'Rápida y letal. Empieza con Cuchillas Orbitales.'
  },
  tempest: {
    classId: 2,
    name: 'TEMPEST',
    tier: 'Épica',
    color: '#38c8ff',
    weapon: 'arc',
    hp: 1,
    speed: 1.04,
    might: 1.05,
    crit: 0.03,
    cooldown: 0.9,
    yield: 0.3,
    desc: 'Núcleo de plasma. Empieza con Bobina de Arco.'
  },
  leviathan: {
    classId: 3,
    name: 'LEVIATHAN',
    tier: 'Legendaria',
    color: '#ffb02e',
    weapon: 'missile',
    hp: 1.15,
    speed: 1,
    might: 1.12,
    crit: 0.05,
    cooldown: 0.95,
    yield: 0.5,
    desc: 'Acorazado legendario (300 unidades). Misiles buscadores.'
  }
};

export const SHIP_BY_CLASS = Object.fromEntries(
  Object.entries(SHIPS).map(([key, s]) => [s.classId, key])
);

export function shipYield(shipKey, level) {
  const s = SHIPS[shipKey] ?? SHIPS.spark;
  const lv = shipKey === 'spark' ? 1 : level;
  return 1 + s.yield + 0.03 * (lv - 1);
}

/** Las armas tienen 5 niveles. cd = recarga en ticks (60 por segundo). */
export const WEAPONS = {
  blaster: {
    name: 'Pulse Blaster',
    color: '#4de8ff',
    desc: ['Dispara al enemigo más cercano', '+1 proyectil', '+40% daño', '+1 proyectil y perfora 1', '+55% daño, -15% recarga'],
    levels: [
      { cd: 32, dmg: 10, count: 1, pierce: 0 },
      { cd: 32, dmg: 10, count: 2, pierce: 0 },
      { cd: 32, dmg: 14, count: 2, pierce: 0 },
      { cd: 32, dmg: 14, count: 3, pierce: 1 },
      { cd: 27, dmg: 22, count: 3, pierce: 1 }
    ]
  },
  orbit: {
    name: 'Cuchillas Orbitales',
    color: '#b36bff',
    desc: ['Cuchillas giran a tu alrededor', '+1 cuchilla', '+50% daño, más radio', '+1 cuchilla, más rápidas', '+1 cuchilla, +40% daño'],
    levels: [
      { count: 2, dmg: 9, radius: 78, speed: 3.0, hitCd: 24 },
      { count: 3, dmg: 9, radius: 78, speed: 3.0, hitCd: 24 },
      { count: 3, dmg: 14, radius: 92, speed: 3.2, hitCd: 22 },
      { count: 4, dmg: 14, radius: 92, speed: 3.6, hitCd: 20 },
      { count: 5, dmg: 20, radius: 102, speed: 3.9, hitCd: 18 }
    ]
  },
  arc: {
    name: 'Bobina de Arco',
    color: '#7fe9ff',
    desc: ['Rayo que salta entre enemigos', '+2 saltos', '+60% daño', '-22% recarga, +1 salto', '+45% daño, +3 saltos'],
    levels: [
      { cd: 70, dmg: 16, chains: 3 },
      { cd: 70, dmg: 16, chains: 5 },
      { cd: 70, dmg: 26, chains: 5 },
      { cd: 55, dmg: 26, chains: 6 },
      { cd: 55, dmg: 38, chains: 9 }
    ]
  },
  nova: {
    name: 'Nova Pulse',
    color: '#4dff9a',
    desc: ['Onda expansiva que repele', '+25% radio', '+60% daño', '-20% recarga, más radio', '+50% daño, +20% radio'],
    levels: [
      { cd: 150, dmg: 20, radius: 130, kb: 260 },
      { cd: 150, dmg: 20, radius: 160, kb: 270 },
      { cd: 150, dmg: 32, radius: 160, kb: 280 },
      { cd: 120, dmg: 32, radius: 176, kb: 290 },
      { cd: 120, dmg: 48, radius: 206, kb: 320 }
    ]
  },
  missile: {
    name: 'Misiles Buscadores',
    color: '#ffb02e',
    desc: ['Misiles que persiguen y explotan', '+1 misil', '+45% daño', '+1 misil, explosión mayor', '+40% daño, -15% recarga'],
    levels: [
      { cd: 96, dmg: 26, count: 1, splash: 62 },
      { cd: 96, dmg: 26, count: 2, splash: 62 },
      { cd: 96, dmg: 38, count: 2, splash: 66 },
      { cd: 92, dmg: 38, count: 3, splash: 80 },
      { cd: 78, dmg: 54, count: 3, splash: 86 }
    ]
  },
  lance: {
    name: 'Lanza del Rift',
    color: '#ff4dd2',
    desc: ['Rayo perforante hacia donde miras', '+45% ancho', '+55% daño', '-20% recarga, dispara también atrás', '+45% daño, +25% alcance'],
    levels: [
      { cd: 118, dmg: 30, length: 520, width: 22, back: false },
      { cd: 118, dmg: 30, length: 540, width: 32, back: false },
      { cd: 118, dmg: 46, length: 560, width: 32, back: false },
      { cd: 95, dmg: 46, length: 560, width: 34, back: true },
      { cd: 95, dmg: 66, length: 690, width: 40, back: true }
    ]
  }
};

export const WEAPON_ORDER = ['blaster', 'orbit', 'arc', 'nova', 'missile', 'lance'];

export const PASSIVES = {
  might: { name: 'Amplificador', desc: '+12% daño', max: 5, apply: (st, lv) => { st.might += 0.12 * lv; } },
  haste: { name: 'Overclock', desc: '-7% recarga', max: 5, apply: (st, lv) => { st.cooldown *= 1 - 0.07 * lv; } },
  thrust: { name: 'Propulsores', desc: '+8% velocidad', max: 5, apply: (st, lv) => { st.speed *= 1 + 0.08 * lv; } },
  magnet: { name: 'Magnetar', desc: '+35% radio de recolección', max: 5, apply: (st, lv) => { st.magnet *= 1 + 0.35 * lv; } },
  hull: { name: 'Blindaje', desc: '+20 vida máx. y +1 armadura', max: 5, apply: (st, lv) => { st.maxHp += 20 * lv; st.armor += lv; } },
  repair: { name: 'Nanoreparación', desc: '+0.35 vida por segundo', max: 5, apply: (st, lv) => { st.regen += 0.35 * lv; } },
  crit: { name: 'Matriz Crítica', desc: '+6% prob. de crítico', max: 5, apply: (st, lv) => { st.crit += 0.06 * lv; } },
  area: { name: 'Expansor', desc: '+10% área de efecto', max: 5, apply: (st, lv) => { st.area *= 1 + 0.1 * lv; } },
  multi: { name: 'Multiplexor', desc: '+1 proyectil', max: 2, apply: (st, lv) => { st.amount += lv; } },
  growth: { name: 'Sifón de Datos', desc: '+10% experiencia', max: 5, apply: (st, lv) => { st.xpGain *= 1 + 0.1 * lv; } },
  fortune: { name: 'Lente de Shards', desc: '+10% prob. de Shards', max: 5, apply: (st, lv) => { st.shardLuck *= 1 + 0.1 * lv; } }
};

export const PASSIVE_ORDER = ['might', 'haste', 'thrust', 'magnet', 'hull', 'repair', 'crit', 'area', 'multi', 'growth', 'fortune'];

/**
 * Enemigos. `from` = segundo en que empiezan a aparecer; `weight` = frecuencia relativa.
 */
export const ENEMIES = {
  mite: { name: 'Mite', hp: 5, speed: 148, dmg: 6, r: 9, xp: 1, ai: 'chase', color: '#ff4d8d', from: 0, weight: 5, shape: 'tri' },
  drone: { name: 'Drone', hp: 13, speed: 104, dmg: 8, r: 13, xp: 2, ai: 'chase', color: '#ff7a3d', from: 0, weight: 6, shape: 'diamond' },
  splitter: { name: 'Splitter', hp: 30, speed: 92, dmg: 9, r: 16, xp: 3, ai: 'chase', split: 3, color: '#ffd23d', from: 40, weight: 3, shape: 'hex' },
  dasher: { name: 'Dasher', hp: 22, speed: 96, dmg: 12, r: 14, xp: 4, ai: 'dash', dashSpeed: 540, color: '#ff3d3d', from: 85, weight: 3, shape: 'arrow' },
  spitter: { name: 'Spitter', hp: 20, speed: 88, dmg: 9, r: 14, xp: 4, ai: 'ranged', bulletSpeed: 230, color: '#c84dff', from: 130, weight: 2.4, shape: 'circle' },
  brute: { name: 'Brute', hp: 85, speed: 66, dmg: 16, r: 24, xp: 8, ai: 'chase', kbResist: 0.4, color: '#ff5a1f', from: 200, weight: 2, shape: 'square' },
  warden: { name: 'Guardián del Rift', hp: 600, speed: 112, dmg: 22, r: 50, xp: 150, ai: 'boss', kbResist: 0.05, color: '#ff2a6d', boss: true, shape: 'boss' }
};

export const ENEMY_ORDER = ['mite', 'drone', 'splitter', 'dasher', 'spitter', 'brute'];

export const BASE_STATS = {
  maxHp: 100,
  speed: 182,
  magnet: 85,
  armor: 0,
  regen: 0,
  might: 1,
  cooldown: 1,
  area: 1,
  amount: 0,
  crit: 0.05,
  xpGain: 1,
  shardLuck: 1
};

export function xpToNext(level) {
  const l = level - 1;
  return 5 + l * 5 + Math.floor(l * l * 0.22);
}
