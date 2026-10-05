// Contenido del juego: naves, armas, mejoras pasivas, enemigos y ritmo de la partida.
// Compartido por el cliente (render/UI) y el servidor (verificación por replay).

export const RUN = {
  /** A los 10:00 aparece el Corazón del Rift: hay que destruirlo para ganar. */
  durationSec: 600,
  /** Si el Corazón sigue vivo a los 12:00, el Rift colapsa y la partida termina. */
  hardLimitSec: 720,
  maxEnemies: 380,
  bossTimes: [180, 360, 540],
  swarmTimes: [120, 300, 450],
  /** Escuadrones de élite: tres élites juntos. */
  elitePackTimes: [150, 330, 480],
  /** Lluvias de meteoritos (duran `meteorSec`): dañan a la nave y también a los enemigos. */
  meteorTimes: [285, 420, 560],
  meteorSec: 20,
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
    evo: { name: 'Tormenta de Pulsos', passive: 'haste', desc: 'Ráfaga continua que atraviesa enemigos', stats: { cd: 9, dmg: 22, count: 3, pierce: 2 } },
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
    evo: { name: 'Singularidad', passive: 'area', desc: 'Siete cuchillas gigantes a toda velocidad', stats: { count: 7, dmg: 30, radius: 132, speed: 4.6, hitCd: 14 } },
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
    evo: { name: 'Tempestad', passive: 'crit', desc: 'Rayos que saltan entre 14 enemigos', stats: { cd: 34, dmg: 50, chains: 14 } },
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
    evo: { name: 'Supernova', passive: 'hull', desc: 'Explosión gigante y frecuente', stats: { cd: 88, dmg: 80, radius: 270, kb: 380 } },
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
    evo: { name: 'Enjambre', passive: 'might', desc: 'Cinco misiles de explosión enorme', stats: { cd: 50, dmg: 64, count: 5, splash: 112 } },
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
    evo: { name: 'Rayo del Vacío', passive: 'thrust', desc: 'Rayo colosal hacia adelante y atrás', stats: { cd: 60, dmg: 95, length: 920, width: 58, back: true } },
    levels: [
      { cd: 118, dmg: 30, length: 520, width: 22, back: false },
      { cd: 118, dmg: 30, length: 540, width: 32, back: false },
      { cd: 118, dmg: 46, length: 560, width: 32, back: false },
      { cd: 95, dmg: 46, length: 560, width: 34, back: true },
      { cd: 95, dmg: 66, length: 690, width: 40, back: true }
    ]
  }
};

/** Estadísticas activas de un arma (las de su evolución si ya evolucionó). */
export function weaponStats(w) {
  const def = WEAPONS[w.id];
  return w.evolved ? def.evo.stats : def.levels[w.level - 1];
}

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
 * Talentos del piloto: progreso permanente entre partidas. Se compran con Núcleos (moneda de
 * progreso que no se canjea por tokens) y en la Arena no se aplican, para que gane la habilidad.
 */
export const TALENTS = {
  hull: { name: 'Casco Reforzado', desc: '+6% vida máxima', color: '#4dff9a', apply: (st, lv) => { st.maxHp *= 1 + 0.06 * lv; } },
  power: { name: 'Calibración', desc: '+4% daño', color: '#ff4dd2', apply: (st, lv) => { st.might += 0.04 * lv; } },
  reflex: { name: 'Reflejos', desc: '-3% recarga', color: '#4de8ff', apply: (st, lv) => { st.cooldown *= 1 - 0.03 * lv; } },
  engines: { name: 'Motores Afinados', desc: '+3% velocidad', color: '#b36bff', apply: (st, lv) => { st.speed *= 1 + 0.03 * lv; } },
  magnet: { name: 'Imán de Cristales', desc: '+12% radio de recolección', color: '#ffc94d', apply: (st, lv) => { st.magnet *= 1 + 0.12 * lv; } },
  memory: { name: 'Memoria de Combate', desc: '+4% experiencia', color: '#7fe9ff', apply: (st, lv) => { st.xpGain *= 1 + 0.04 * lv; } }
};

export const TALENT_ORDER = ['hull', 'power', 'reflex', 'engines', 'magnet', 'memory'];
export const TALENT_MAX = 5;
/** Costo en Núcleos de subir un talento al nivel `level` (1..5). */
export const TALENT_COST = [40, 90, 160, 250, 360];

export function talentCost(level) {
  return TALENT_COST[level - 1] ?? Infinity;
}

/** Normaliza talentos que vienen de afuera (cliente, base de datos): ids conocidos y niveles 0..5. */
export function sanitizeTalents(t) {
  const out = {};
  if (!t || typeof t !== 'object') return out;
  for (const id of TALENT_ORDER) {
    const lv = Number(t[id]);
    if (Number.isInteger(lv) && lv > 0) out[id] = Math.min(TALENT_MAX, lv);
  }
  return out;
}

/** Núcleos que da una partida (resumen de `summarize`): bajas, tiempo, jefes, victoria y Shards recogidos. */
export function coresFromSummary(sum) {
  const base =
    Math.floor(sum.kills / 20) +
    Math.floor(sum.timeSec / 15) +
    sum.bossesKilled * 20 +
    (sum.victory ? 60 : 0) +
    Math.floor((sum.shardsCollected ?? 0) / 4);
  return Math.floor(base * riftMods(sum.rift ?? 0).reward);
}

/**
 * Enemigos. `from` = segundo en que empiezan a aparecer; `weight` = frecuencia relativa.
 */
export const ENEMIES = {
  // ai: chase = persigue · dash = carga en línea · ranged = dispara de lejos · mine = se acerca y explota
  //     blink = se teletransporta junto a la nave · sniper = apunta un láser y dispara rápido · boss = jefe
  mite: { name: 'Mite', hp: 5, speed: 148, dmg: 6, r: 9, xp: 1, ai: 'chase', color: '#ff4d8d', from: 0, weight: 5, shape: 'tri' },
  drone: { name: 'Drone', hp: 13, speed: 104, dmg: 8, r: 13, xp: 2, ai: 'chase', color: '#ff7a3d', from: 0, weight: 6, shape: 'diamond' },
  splitter: { name: 'Splitter', hp: 30, speed: 92, dmg: 9, r: 16, xp: 3, ai: 'chase', split: 3, color: '#ffd23d', from: 40, weight: 3, shape: 'hex' },
  dasher: { name: 'Dasher', hp: 22, speed: 96, dmg: 12, r: 14, xp: 4, ai: 'dash', dashSpeed: 540, color: '#ff3d3d', from: 85, weight: 3, shape: 'arrow' },
  spitter: { name: 'Spitter', hp: 20, speed: 88, dmg: 9, r: 14, xp: 4, ai: 'ranged', bulletSpeed: 230, color: '#c84dff', from: 130, weight: 2.4, shape: 'circle' },
  brute: { name: 'Brute', hp: 85, speed: 66, dmg: 16, r: 24, xp: 8, ai: 'chase', kbResist: 0.4, color: '#ff5a1f', from: 200, weight: 2, shape: 'square' },
  // Segunda mitad de la partida: enemigos que obligan a cambiar de táctica.
  mine: { name: 'Nova Mine', hp: 26, speed: 150, dmg: 30, r: 12, xp: 4, ai: 'mine', fuse: 40, blast: 82, color: '#ffb02e', from: 300, weight: 2.4, shape: 'star' },
  wraith: { name: 'Wraith', hp: 46, speed: 92, dmg: 15, r: 15, xp: 6, ai: 'blink', color: '#d8c8ff', from: 330, weight: 2, shape: 'crescent' },
  aegis: { name: 'Aegis', hp: 170, speed: 58, dmg: 18, r: 26, xp: 12, ai: 'chase', aura: 160, auraDR: 0.45, kbResist: 0.3, color: '#5468ff', from: 390, weight: 1.3, shape: 'shield' },
  lancer: { name: 'Lancer', hp: 38, speed: 82, dmg: 20, r: 15, xp: 7, ai: 'sniper', range: 430, aim: 52, bulletSpeed: 640, color: '#d4ff3d', from: 450, weight: 1.8, shape: 'cross' },
  warden: { name: 'Guardián del Rift', hp: 600, speed: 112, dmg: 22, r: 50, xp: 150, ai: 'boss', kbResist: 0.05, color: '#ff2a6d', boss: true, shape: 'boss' },
  heart: { name: 'Corazón del Rift', hp: 5200, speed: 88, dmg: 30, r: 72, xp: 0, ai: 'boss', kbResist: 0, color: '#ff3df0', boss: true, final: true, shape: 'core' }
};

export const ENEMY_ORDER = ['mite', 'drone', 'splitter', 'dasher', 'spitter', 'brute', 'mine', 'wraith', 'aegis', 'lancer'];

/**
 * Niveles del Rift: dificultad que el jugador elige y desbloquea ganando. Cada nivel endurece la
 * partida y paga más (Shards y Núcleos), así el desafío se premia por habilidad y no por pagar.
 */
export const RIFT_MAX = 10;

export function riftMods(level) {
  const L = Math.max(0, Math.min(RIFT_MAX, level | 0));
  return {
    level: L,
    hp: 1 + 0.18 * L,
    dmg: 1 + 0.1 * L,
    spawn: 1 + 0.06 * L,
    early: 1 - 0.05 * L, // los enemigos nuevos llegan antes
    eliteEverySec: Math.max(20, 40 - 2 * L),
    reward: 1 + 0.15 * L
  };
}

/** Multiplicador de vida enemiga por tiempo: lineal al principio y cada vez más empinado al final. */
export function enemyHpScale(t) {
  const late = t > 270 ? (t - 270) / 330 : 0;
  return (1 + t / 95) * (1 + late * late * 1.6);
}

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
  // Pasado el nivel 25 cuesta bastante más subir: corta la bola de nieve del final.
  const late = Math.max(0, l - 24);
  return 5 + l * 5 + Math.floor(l * l * 0.22) + Math.floor(late * late * 1.4);
}
