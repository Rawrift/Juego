// Datos del juego: cargas, planetas, naves, mejoras y niveles. Los nombres visibles están en i18n.

export const BOX = 10; // toneladas por contenedor
export const DRONE_CYCLE = 2.8; // segundos que tarda un drone en llevar un contenedor y volver
export const HQ_TIMES = { liftoff: 2.6, docking: 3.2, landing: 3.0 };

export const CARGO = {
  agua: { price: 40 },
  mineral: { price: 55 },
  alimentos: { price: 72 },
  combustible: { price: 96 },
  piezas: { price: 135 }
};
export const CARGO_IDS = Object.keys(CARGO);

/**
 * Lugares del sistema. `orbit` = radio, `period` = segundos por vuelta, `phase` = ángulo inicial.
 * `sells`: lo que se puede comprar ahí · `buys`: lo que piden en sus pedidos.
 */
export const PORTS = {
  forja: { kind: 'volcanic', orbit: 15, period: 150, phase: 2.2, radius: 2.2, sells: ['piezas'], buys: ['mineral', 'combustible'], level: 5, portTime: 2.4 },
  kepa: { kind: 'ice', orbit: 25, period: 220, phase: 4.1, radius: 2.5, sells: ['agua'], buys: ['alimentos', 'piezas'], level: 1, portTime: 2.0 },
  hq: { kind: 'station', orbit: 37, period: 380, phase: 0.5, radius: 1.4, sells: [], buys: [], level: 1 },
  ferra: { kind: 'rocky', orbit: 50, period: 540, phase: 1.4, radius: 3.0, sells: ['mineral'], buys: ['agua', 'alimentos', 'combustible'], level: 1, portTime: 2.2 },
  vesta: { kind: 'garden', orbit: 64, period: 760, phase: 5.2, radius: 3.6, sells: ['alimentos'], buys: ['agua', 'mineral', 'piezas', 'combustible'], level: 1, portTime: 2.0 },
  nimbus: { kind: 'gas', orbit: 92, period: 1180, phase: 3.0, radius: 6.4, sells: ['combustible'], buys: ['alimentos', 'agua', 'piezas'], level: 3, portTime: 2.6 }
};
export const PORT_IDS = Object.keys(PORTS).filter((p) => p !== 'hq');

/** Cinturón de asteroides: cruzarlo sin escudos cuesta el doble de tiempo. */
export const BELT = { inner: 74, outer: 82, slow: 0.5 };

export const SHIPS = {
  colibri: { cap: 20, speed: 3.4, fuel: 2.4, price: 3500, level: 1 },
  mula: { cap: 60, speed: 2.7, fuel: 5.2, price: 15000, level: 2 },
  titan: { cap: 120, speed: 2.1, fuel: 8.8, price: 48000, level: 4 }
};
export const SHIP_IDS = Object.keys(SHIPS);

/** Mejoras de la estación: cada nivel tiene su valor, su precio y el nivel de reputación que pide. */
export const UPGRADES = {
  docks: [{ v: 1 }, { v: 2, cost: 6000, level: 2 }, { v: 3, cost: 18000, level: 4 }, { v: 4, cost: 42000, level: 6 }],
  drones: [{ v: 2 }, { v: 3, cost: 2500, level: 1 }, { v: 4, cost: 6500, level: 2 }, { v: 6, cost: 15000, level: 3 }, { v: 8, cost: 32000, level: 5 }],
  depot: [{ v: 120 }, { v: 240, cost: 4500, level: 1 }, { v: 360, cost: 12000, level: 3 }, { v: 600, cost: 28000, level: 5 }, { v: 1080, cost: 65000, level: 7 }],
  hangar: [{ v: 3 }, { v: 5, cost: 7000, level: 2 }, { v: 8, cost: 24000, level: 4 }],
  engines: [{ v: 1 }, { v: 1.12, cost: 8000, level: 2 }, { v: 1.25, cost: 20000, level: 4 }, { v: 1.4, cost: 45000, level: 6 }],
  shields: [{ v: 0 }, { v: 1, cost: 12000, level: 3 }],
  autopilot: [{ v: 0 }, { v: 1, cost: 9000, level: 3 }]
};
export const UPGRADE_IDS = Object.keys(UPGRADES);

/** Reputación necesaria para cada nivel (índice = nivel - 1). */
export const LEVELS = [0, 60, 170, 340, 600, 950, 1400, 2000, 2800, 3800, 5200, 7000];

export const START = {
  credits: 3000,
  ships: ['colibri', 'colibri'],
  stock: { agua: 40, alimentos: 20 }
};

/** Cuánto tiempo fuera se simula al volver (segundos). */
export const OFFLINE_MAX = 2 * 3600;
