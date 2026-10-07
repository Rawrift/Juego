// Naves de diseño exclusivo de Rift Cargo (Hangar Rift): tres por clase, cada una con su silueta.
// Livianas (2 contenedores): Vencejo (ala delta y doble cola), Libélula (cuatro alas solares) y Halcón
// Rift (blindado, alas invertidas y cristal de la grieta). Medianas (6): Raya (manta plana), Nómada
// (caravana con velas solares y motor iónico) y Bisonte (blindado con espolón). Pesadas (12): Nova
// (crucero con anillo acelerador), Leviatán (ballena con luz propia) y Coloso (fortaleza de 8 motores).
// Todas miran hacia +Z, como las de fábrica, y devuelven los lugares de sus contenedores.

import * as THREE from 'three';
import { rbox, cyl, sphere, lathe, mat, glass, glow, part, profile, cached, wingPair } from './kit.js';
import { bedTexture } from './textures.js';

/** Medidas de cada nave (adelante y atrás de su origen, alto y ancho), como en models.js. */
export const EXCLUSIVE_DIMS = {
  vencejo: { front: 2.1, back: 2.9, height: 2.15, width: 2.7 },
  libelula: { front: 1.95, back: 2.95, height: 2.0, width: 3.9 },
  halcon: { front: 2.3, back: 2.6, height: 2.35, width: 4.1 },
  raya: { front: 2.25, back: 4.8, height: 2.15, width: 4.3 },
  nomada: { front: 2.2, back: 4.7, height: 3.0, width: 4.2 },
  bisonte: { front: 3.3, back: 5.6, height: 2.6, width: 2.8 },
  nova: { front: 3.1, back: 7.3, height: 2.75, width: 4.1 },
  leviatan: { front: 3.1, back: 7.8, height: 2.75, width: 4.0 },
  coloso: { front: 2.9, back: 7.6, height: 3.5, width: 3.8 }
};

/** Contenedores en dos o tres columnas, de adelante hacia atrás (como Mula y Titán). */
function grid(SLOT, CONTAINER, cols, rows, y, z0) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(new THREE.Vector3((c - (cols - 1) / 2) * SLOT.x, y + CONTAINER.h / 2, z0 - r * SLOT.z));
  return out;
}

/** Fuselaje de torno acostado: el perfil va de la cola (0) a la nariz; `z0` = dónde queda la cola. */
function body(key, pts, z0, seg = 36) {
  return cached(`exBody:${key}`, () => {
    const geo = lathe(`${key}Lathe`, pts, seg).clone();
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, z0);
    return geo;
  });
}

/** Reflejo en X de una función que arma una pieza de un lado. */
const both = (fn) => [-1, 1].forEach(fn);

export function exclusiveBuilders({ addEngine, plate, navLight, leg, SLOT, CONTAINER }) {
  /** Vencejo: fuselaje en punta, ala delta, dos colas en botalones y los contenedores bajo la panza. */
  function vencejo(g, label, flames, navLights, legs, L) {
    const { liv, hull, dark, paint, neon, steel } = L;
    part(g, body('vencejo', [[0.001, 0], [0.34, 0.02], [0.42, 0.3], [0.46, 1.2], [0.44, 2.4], [0.34, 3.4], [0.19, 4.1], [0.05, 4.5], [0.001, 4.55]], -2.45), hull, 0, 1.55, 0);
    const canopy = part(g, sphere(0.32, 24, 16), glass(), 0, 1.86, 0.95);
    canopy.scale.set(0.75, 0.55, 1.7);
    part(g, cyl(0.47, 0.47, 0.1, 32), neon, 0, 1.55, 0.2, Math.PI / 2, 0, 0);
    part(g, cyl(0.45, 0.45, 0.14, 32), paint, 0, 1.55, -1.5, Math.PI / 2, 0, 0);
    // Ala delta de punta a punta y su borde de color.
    const [wr, wl] = wingPair('vencejoWing', [[0.3, 0.7], [1.3, -1.25], [1.35, -1.75], [0.3, -1.75]], 0.08);
    part(g, wr, hull, 0, 1.4, 0);
    part(g, wl, hull, 0, 1.4, 0);
    both((sx) => {
      part(g, rbox(0.08, 0.1, 0.5, 0.03), neon, sx * 1.33, 1.42, -1.5);
      // Botalones de cola con deriva.
      part(g, rbox(0.22, 0.22, 2.2, 0.08), hull, sx * 1.1, 1.35, -1.6);
      part(g, rbox(0.24, 0.06, 2.0, 0.02), paint, sx * 1.1, 1.47, -1.6);
      part(g, profile('vencejoFin', [[0, 0], [0.8, 0], [0.55, 0.75], [0.2, 0.75]], 0.07, 0.02), paint, sx * 1.1, 1.42, -2.7, 0, 0, sx * -0.12);
      addEngine(g, flames, sx * 1.1, 1.35, -2.7, 0.62, neon, hull, L.trail);
      navLight(g, navLights, sx * 1.36, 1.42, -1.25, sx < 0 ? 0xff4d6a : 0x4dff9a);
      plate(g, label, liv, sx * 1.22, 1.35, -1.25, sx * Math.PI / 2, 0.55);
      // Esquíes y patas.
      part(legs, rbox(0.1, 0.07, 3.0, 0.03), dark, sx * 0.62, 0.04, -0.25);
      for (const z of [0.7, -1.2]) part(legs, cyl(0.035, 0.035, 1.36, 8), steel, sx * 0.62, 0.72, z);
    });
    addEngine(g, flames, 0, 1.55, -2.45, 1.35, neon, hull, L.trail);
    // Cuna de los contenedores (uno detrás del otro) colgada del fuselaje.
    part(g, rbox(0.95, 0.12, 2.9, 0.04), dark, 0, 1.08, -0.22);
    for (const z of [1.05, -1.5]) part(g, rbox(0.95, 0.12, 0.12, 0.03), paint, 0, 1.0, z);
    part(g, rbox(0.34, 0.07, 0.06, 0.02), glow(0xe8fbff, 2), 0, 1.42, 2.05);
    return [new THREE.Vector3(0, 0.62, 0.45), new THREE.Vector3(0, 0.62, -0.89)];
  }

  /** Libélula: cabina burbuja, cuatro alas largas con paneles solares, cola fina y motor iónico. */
  function libelula(g, label, flames, navLights, legs, L) {
    const { liv, hull, dark, paint, neon, steel } = L;
    const solar = mat(0x14215c, { rough: 0.2, metal: 0.65, env: 1.6, emissive: 0x1a3cff, ei: 0.12 });
    part(g, sphere(0.55, 32, 20), glass(), 0, 1.35, 1.3);
    part(g, cyl(0.5, 0.56, 0.16, 32), paint, 0, 1.35, 0.78, Math.PI / 2, 0, 0);
    part(g, rbox(0.95, 0.85, 1.6, 0.32), hull, 0, 1.3, 0.05);
    // Cola larga y fina con anillos de color.
    part(g, cyl(0.24, 0.12, 2.4, 20), hull, 0, 1.3, -1.85, Math.PI / 2, 0, 0);
    for (const [z, r] of [[-1.2, 0.225], [-2.0, 0.185]]) part(g, cyl(r, r, 0.08, 20), paint, 0, 1.3, z, Math.PI / 2, 0, 0);
    part(g, profile('libelulaFin', [[0, 0], [0.55, 0], [0.35, 0.5], [0.1, 0.5]], 0.05, 0.015), paint, 0, 1.38, -2.95);
    addEngine(g, flames, 0, 1.3, -2.95, 0.85, neon, hull, L.trail);
    // Cuatro alas (dos pares), con los paneles solares encima y el borde encendido.
    const [fr, fl] = wingPair('libelulaWingF', [[0.4, 0.45], [1.85, 0.25], [1.95, -0.05], [0.4, -0.15]], 0.05, 0.015);
    const [br, bl] = wingPair('libelulaWingB', [[0.4, -0.25], [1.6, -0.5], [1.68, -0.8], [0.4, -0.75]], 0.05, 0.015);
    for (const w of [fr, fl, br, bl]) part(g, w, solar, 0, 1.62, 0);
    both((sx) => {
      part(g, rbox(1.45, 0.03, 0.05, 0.01), neon, sx * 1.15, 1.66, 0.36, 0, sx * 0.14, 0);
      part(g, rbox(0.4, 0.12, 0.3, 0.06), hull, sx * 0.45, 1.6, 0.15);
      navLight(g, navLights, sx * 1.95, 1.62, 0.1, sx < 0 ? 0xff4d6a : 0x4dff9a);
      // Contenedor colgado a cada lado, con su pilón.
      part(g, rbox(0.12, 0.5, 0.12, 0.03), steel, sx * 0.85, 1.3, -0.2);
      part(g, rbox(0.95, 0.1, 1.35, 0.04), dark, sx * 0.85, 1.07, -0.2);
      plate(g, label, liv, sx * 0.19, 1.3, -1.45, sx * Math.PI / 2, 0.5);
    });
    for (const [sx, z] of [[-1, 0.7], [1, 0.7], [-1, -0.55], [1, -0.55]]) leg(legs, sx * 0.38, z, 0.9, sx, steel, dark, 0.045);
    return [new THREE.Vector3(-0.85, 0.62, -0.2), new THREE.Vector3(0.85, 0.62, -0.2)];
  }

  /** Halcón Rift: casco facetado blindado, alas invertidas, cristal de la grieta y cunas acorazadas. */
  function halcon(g, label, flames, navLights, legs, L) {
    const { liv, dark, paint, neon, steel } = L;
    const armor = mat(L.hullColor, { rough: 0.42, metal: 0.55, env: 1.2, flat: true });
    part(g, profile('halconBody', [[-2.3, 0.75], [1.2, 0.72], [2.25, 1.05], [1.6, 1.62], [-1.2, 1.78], [-2.3, 1.45]], 1.3, 0.06), armor, 0, 0, 0);
    const cab = part(g, rbox(0.8, 0.3, 0.75, 0.08), glass(), 0, 1.62, 1.2, -0.42, 0, 0);
    cab.castShadow = false;
    part(g, rbox(1.05, 0.12, 1.5, 0.04), dark, 0, 1.82, -0.45);
    // Cristal de la grieta sobre el lomo.
    part(g, cached('halconCrystal', () => new THREE.OctahedronGeometry(0.3, 0)), glow(0xc77dff, 2.6), 0, 2.12, -0.45, 0, 0.6, 0);
    part(g, cyl(0.22, 0.28, 0.12, 6), steel, 0, 1.9, -0.45);
    // Emisor del escudo en la nariz.
    part(g, cyl(0.24, 0.24, 0.06, 28), glow(0x9ff4ff, 2.4), 0, 1.0, 2.24, Math.PI / 2, 0, 0);
    // Alas invertidas (la punta va adelante) con la punta encendida.
    const [wr, wl] = wingPair('halconWing', [[0.6, -1.0], [1.95, -0.25], [2.0, -0.6], [0.6, -2.2]], 0.1, 0.03);
    const wingMat = mat(0x6670b0, { rough: 0.4, metal: 0.5, env: 1.2, flat: true });
    part(g, wr, wingMat, 0, 1.55, 0);
    part(g, wl, wingMat, 0, 1.55, 0);
    both((sx) => {
      part(g, rbox(0.12, 0.14, 0.42, 0.04), neon, sx * 1.98, 1.55, -0.45);
      part(g, rbox(0.06, 0.05, 1.5, 0.02), paint, sx * 1.27, 1.62, -0.63, 0, sx * 1.064, 0);
      navLight(g, navLights, sx * 2.03, 1.65, -0.45, sx < 0 ? 0xff4d6a : 0x4dff9a);
      // Cuna acorazada: piso y placa exterior (el contenedor se ve de arriba).
      part(g, rbox(0.95, 0.1, 1.65, 0.03), dark, sx * 1.12, 0.5, -0.15);
      part(g, rbox(0.1, 0.9, 1.6, 0.04), armor, sx * 1.62, 0.95, -0.15);
      part(g, rbox(0.12, 0.08, 1.62, 0.02), paint, sx * 1.63, 1.42, -0.15);
      part(g, rbox(0.5, 0.12, 0.5, 0.04), dark, sx * 0.85, 0.85, -0.15);
      addEngine(g, flames, sx * 0.4, 1.2, -2.32, 1.0, neon, armor, L.trail);
      addEngine(g, flames, sx * 1.12, 0.95, -1.05, 0.55, paint, armor, L.trail);
      plate(g, label, liv, sx * 0.67, 1.3, -1.35, sx * Math.PI / 2, 0.6);
    });
    for (const [sx, z] of [[-1, 1.0], [1, 1.0], [-1, -1.65], [1, -1.65]]) leg(legs, sx * 0.48, z, 0.74, sx, steel, dark, 0.055);
    return [new THREE.Vector3(-1.12, 0.55 + CONTAINER.h / 2, -0.15), new THREE.Vector3(1.12, 0.55 + CONTAINER.h / 2, -0.15)];
  }

  /** Raya: cuerpo de manta, plano y ancho; los contenedores en el lomo y una cola en punta. */
  function raya(g, label, flames, navLights, legs, L) {
    const { liv, hull, dark, paint, neon, steel } = L;
    const manta = [[0, 2.15], [0.7, 1.75], [1.9, 0.35], [2.15, -0.6], [1.6, -1.55], [0.95, -2.7], [0.55, -4.25], [-0.55, -4.25], [-0.95, -2.7], [-1.6, -1.55], [-2.15, -0.6], [-1.9, 0.35], [-0.7, 1.75]];
    part(g, wingPair('rayaBody', manta, 0.32, 0.08)[0], hull, 0, 0.75, 0);
    part(g, rbox(1.35, 0.5, 5.4, 0.18), paint, 0, 0.98, -1.45);
    part(g, rbox(2.15, 0.1, 4.3, 0.04), mat(0xffffff, { map: bedTexture(2, 3), rough: 0.6 }), 0, 1.27, -2.2);
    part(g, rbox(2.25, 0.18, 4.4, 0.05), dark, 0, 1.18, -2.2);
    const canopy = part(g, sphere(0.5, 28, 18), glass(), 0, 1.15, 1.15);
    canopy.scale.set(1.25, 0.55, 1.45);
    both((sx) => {
      // Aletas cefálicas (los "cuernos" de la manta).
      part(g, rbox(0.2, 0.14, 0.9, 0.06), paint, sx * 0.68, 0.82, 2.0, 0, sx * -0.28, 0);
      // Bordes de ataque encendidos.
      part(g, rbox(0.06, 0.06, 1.84, 0.02), neon, sx * 1.3, 0.93, 1.05, 0, sx * 2.43, 0);
      part(g, rbox(0.08, 0.08, 0.9, 0.03), neon, sx * 2.05, 0.93, -0.6, 0, 0, 0);
      addEngine(g, flames, sx * 0.72, 1.0, -4.25, 1.25, neon, hull, L.trail);
      addEngine(g, flames, sx * 1.45, 0.82, -1.85, 0.7, paint, hull, L.trail);
      navLight(g, navLights, sx * 2.15, 0.85, -0.6, sx < 0 ? 0xff4d6a : 0x4dff9a);
      plate(g, label, liv, sx * 0.69, 1.0, 0.4, sx * Math.PI / 2, 0.75);
    });
    part(g, cyl(0.02, 0.12, 1.0, 10), dark, 0, 0.82, -4.75, -Math.PI / 2, 0, 0);
    part(g, rbox(0.42, 0.08, 0.06, 0.02), glow(0xe8fbff, 2), 0, 0.85, 2.2);
    for (const [sx, z] of [[-1, 1.0], [1, 1.0], [-1, -3.3], [1, -3.3]]) leg(legs, sx * 1.0, z, 0.6, sx, steel, dark, 0.06);
    return grid(SLOT, CONTAINER, 2, 3, 1.31, -0.82);
  }

  /** Nómada: cabina cápsula, armazón abierto con los contenedores, velas solares y motor iónico. */
  function nomada(g, label, flames, navLights, legs, L) {
    const { liv, hull, dark, paint, neon, steel } = L;
    const solar = mat(0x14215c, { rough: 0.2, metal: 0.65, env: 1.6, emissive: 0x1a3cff, ei: 0.12 });
    part(g, body('nomadaCab', [[0.001, 0], [0.5, 0.1], [0.72, 0.5], [0.75, 1.1], [0.6, 1.7], [0.3, 2.0], [0.001, 2.05]], 0.12, 32), hull, 0, 1.25, 0);
    part(g, cyl(0.745, 0.745, 0.26, 32), glass(), 0, 1.4, 1.35, Math.PI / 2, 0, 0);
    part(g, cyl(0.77, 0.77, 0.12, 32), paint, 0, 1.25, 0.4, Math.PI / 2, 0, 0);
    // Armazón: largueros arriba y abajo, costillas y piso.
    both((sx) => {
      for (const y of [0.62, 1.95]) part(g, rbox(0.1, 0.1, 4.6, 0.03), steel, sx * 1.05, y, -2.1);
      for (let z = 0.15; z > -4.5; z -= 1.34) part(g, rbox(0.08, 1.33, 0.08, 0.02), steel, sx * 1.05, 1.28, z);
      // Vela solar abierta hacia arriba como un ala, con marco de color.
      part(g, rbox(0.16, 0.16, 3.2, 0.04), paint, sx * 1.12, 2.02, -2.0);
      const sail = new THREE.Group();
      sail.position.set(sx * 1.58, 2.48, -2.0);
      sail.rotation.z = sx * 0.75;
      part(sail, rbox(1.25, 0.04, 3.1, 0.02), solar, 0, 0, 0);
      part(sail, rbox(1.3, 0.05, 0.06, 0.02), paint, 0, 0, 1.55);
      part(sail, rbox(1.3, 0.05, 0.06, 0.02), paint, 0, 0, -1.55);
      part(sail, rbox(0.06, 0.05, 3.1, 0.02), neon, sx * 0.62, 0.01, 0);
      g.add(sail);
      navLight(g, navLights, sx * 2.06, 2.92, -2.0, sx < 0 ? 0xff4d6a : 0x4dff9a);
      part(g, sphere(0.42, 20, 14), steel, sx * 0.78, 1.25, -4.05);
      plate(g, label, liv, sx * 0.76, 1.2, 1.05, sx * Math.PI / 2, 0.55);
    });
    for (let z = 0.15; z > -4.5; z -= 1.34) part(g, rbox(2.2, 0.08, 0.08, 0.02), steel, 0, 1.95, z);
    part(g, rbox(2.2, 0.1, 4.3, 0.04), mat(0xffffff, { map: bedTexture(2, 3), rough: 0.6 }), 0, 0.64, -2.1);
    part(g, rbox(2.3, 0.26, 4.6, 0.08), dark, 0, 0.47, -2.1);
    // Motor iónico: carcasa, aro y una tobera grande.
    part(g, rbox(1.15, 1.05, 0.95, 0.2), hull, 0, 1.25, -4.05);
    part(g, cyl(0.5, 0.5, 0.1, 28), neon, 0, 1.25, -4.48, Math.PI / 2, 0, 0);
    addEngine(g, flames, 0, 1.25, -4.5, 1.55, neon, hull, L.trail);
    for (const [sx, z] of [[-1, 0.9], [1, 0.9], [-1, -3.6], [1, -3.6]]) leg(legs, sx * 0.95, z, 0.36, sx, steel, dark, 0.06);
    return grid(SLOT, CONTAINER, 2, 3, 0.69, -0.65);
  }

  /** Bisonte: cabina acorazada con espolón, paredes de blindaje en la caja y cuatro motores gruesos. */
  function bisonte(g, label, flames, navLights, legs, L) {
    const { liv, dark, paint, neon, steel } = L;
    const armor = mat(L.hullColor, { rough: 0.45, metal: 0.55, env: 1.15, flat: true });
    part(g, rbox(2.5, 1.45, 1.95, 0.14), armor, 0, 1.52, 1.05);
    part(g, rbox(2.56, 0.5, 2.0, 0.1), paint, 0, 0.74, 1.05);
    part(g, profile('bisonteRam', [[0, 0.3], [0.85, 0.3], [1.3, 0.75], [0.85, 1.2], [0, 1.2]], 2.6, 0.06), mat(0x2a2f55, { rough: 0.4, metal: 0.6, flat: true }), 0, 0, 2.0);
    for (const sx of [-0.6, 0, 0.6]) part(g, rbox(0.4, 0.06, 0.05, 0.02), neon, sx, 0.98, 3.3);
    part(g, rbox(2.05, 0.22, 0.06, 0.04), glass(), 0, 1.92, 2.03);
    for (const x of [-0.7, 0, 0.7]) part(g, cyl(0.001, 0.1, 0.36, 8), steel, x, 2.42, 1.0);
    part(g, rbox(1.6, 0.08, 0.2, 0.03), neon, 0, 2.26, 1.7);
    // Caja con paredes de blindaje.
    part(g, rbox(2.4, 0.34, 4.7, 0.1), dark, 0, 0.42, -2.25);
    part(g, rbox(2.2, 0.1, 4.3, 0.04), mat(0xffffff, { map: bedTexture(2, 3), rough: 0.6 }), 0, 0.64, -2.25);
    both((sx) => {
      part(g, rbox(0.16, 1.1, 4.5, 0.04), armor, sx * 1.22, 1.08, -2.25);
      part(g, rbox(0.18, 0.08, 4.5, 0.02), paint, sx * 1.22, 1.66, -2.25);
      for (let z = -0.4; z > -4.3; z -= 0.95) part(g, rbox(0.06, 0.8, 0.5, 0.02), dark, sx * 1.31, 1.05, z);
      plate(g, label, liv, sx * 1.26, 1.45, 1.05, sx * Math.PI / 2, 0.85);
      navLight(g, navLights, sx * 1.28, 2.1, 1.9, sx < 0 ? 0xff4d6a : 0x4dff9a);
      for (const y of [0.72, 1.36]) addEngine(g, flames, sx * 0.6, y, -5.35, 1.1, neon, armor, L.trail);
    });
    part(g, rbox(2.4, 1.35, 0.9, 0.12), armor, 0, 1.04, -4.9);
    part(g, rbox(2.46, 0.12, 0.92, 0.04), paint, 0, 1.68, -4.9);
    for (const [sx, z] of [[-1, 1.5], [1, 1.5], [-1, -1.6], [1, -1.6], [-1, -4.4], [1, -4.4]]) leg(legs, sx * 1.0, z, 0.45, sx, steel, dark, 0.07);
    return grid(SLOT, CONTAINER, 2, 3, 0.69, -0.82);
  }

  /** Nova: casco largo y afinado, aletas en flecha y un anillo acelerador detrás. */
  function nova(g, label, flames, navLights, legs, L) {
    const { liv, hull, dark, paint, neon, steel } = L;
    const h = part(g, body('novaHull', [[0.001, 0], [0.6, 0.1], [0.95, 0.6], [1.05, 2.0], [1.0, 6.0], [0.75, 8.6], [0.35, 9.8], [0.001, 10.0]], -6.9, 40), hull, 0, 0.98, 0);
    h.scale.set(1.2, 0.6, 1);
    part(g, rbox(3.0, 0.12, 5.75, 0.05), mat(0xffffff, { map: bedTexture(3, 4), rough: 0.6 }), 0, 1.6, -2.7);
    part(g, rbox(3.1, 0.14, 5.85, 0.05), dark, 0, 1.52, -2.7);
    const canopy = part(g, sphere(0.55, 28, 18), glass(), 0, 1.55, 1.35);
    canopy.scale.set(1.3, 0.6, 2.0);
    part(g, rbox(1.6, 0.08, 0.2, 0.03), neon, 0, 1.62, 0.1);
    both((sx) => {
      part(g, rbox(0.1, 0.12, 5.75, 0.03), paint, sx * 1.5, 1.66, -2.7);
      part(g, rbox(0.06, 0.08, 7.2, 0.02), neon, sx * 1.27, 0.98, -2.0);
      navLight(g, navLights, sx * 1.3, 1.05, 2.0, sx < 0 ? 0xff4d6a : 0x4dff9a);
      plate(g, label, liv, sx * 1.29, 1.1, 0.6, sx * Math.PI / 2, 0.95);
      // Riostras del anillo.
      part(g, rbox(0.08, 0.08, 1.1, 0.02), steel, sx * 0.85, 1.45, -5.9, 0, 0, sx * 0.6);
    });
    const [fr, fl] = wingPair('novaFin', [[0.9, -3.4], [2.0, -5.6], [2.05, -6.3], [0.9, -5.0]], 0.1, 0.03);
    part(g, fr, paint, 0, 1.0, 0);
    part(g, fl, paint, 0, 1.0, 0);
    // Anillo acelerador.
    part(g, cached('novaRing', () => new THREE.TorusGeometry(1.25, 0.11, 12, 48)), glow(L.liv, 2.2), 0, 1.45, -6.2, 0, 0, 0, { shadow: false });
    part(g, cached('novaRingShell', () => new THREE.TorusGeometry(1.25, 0.16, 10, 48, Math.PI)), steel, 0, 1.45, -6.05);
    addEngine(g, flames, 0, 0.98, -6.9, 1.5, neon, hull, L.trail);
    both((sx) => addEngine(g, flames, sx * 0.72, 1.05, -6.55, 0.95, neon, hull, L.trail));
    part(g, rbox(0.4, 0.08, 0.05, 0.02), glow(0xe8fbff, 2), 0, 0.9, 3.08);
    for (const [sx, z] of [[-1, 1.8], [1, 1.8], [-1, -1.6], [1, -1.6], [-1, -5.0], [1, -5.0]]) leg(legs, sx * 0.95, z, 0.62, sx, steel, dark, 0.07);
    return grid(SLOT, CONTAINER, 3, 4, 1.66, -1.27);
  }

  /** Leviatán: ballena espacial con manchas de luz, aletas, cola de ballena y la carga en el lomo. */
  function leviatan(g, label, flames, navLights, legs, L) {
    const { liv, hull, dark, paint, neon, steel } = L;
    const b = part(g, body('leviBody', [[0.001, 0], [0.5, 0.15], [1.1, 0.8], [1.45, 2.2], [1.5, 4.5], [1.35, 6.8], [1.0, 8.4], [0.55, 9.4], [0.001, 9.7]], -6.6, 40), hull, 0, 1.0, 0);
    b.scale.set(1, 0.55, 1);
    const belly = part(g, body('leviBelly', [[0.001, 0], [0.45, 0.4], [1.2, 1.6], [1.3, 4.5], [1.0, 7.2], [0.001, 8.4]], -5.6, 32), mat(0xd7dcf5, { rough: 0.5 }), 0, 0.82, 0);
    belly.scale.set(0.9, 0.42, 1);
    part(g, rbox(2.95, 0.12, 5.75, 0.05), mat(0xffffff, { map: bedTexture(3, 4), rough: 0.6 }), 0, 1.86, -2.7);
    part(g, rbox(3.05, 0.14, 5.85, 0.05), dark, 0, 1.78, -2.7);
    const dome = part(g, sphere(0.55, 28, 18), glass(), 0, 1.72, 1.55);
    dome.scale.set(1.2, 0.6, 1.3);
    // Manchas de luz propia en los costados.
    const bio = glow(L.liv, 2.4);
    both((sx) => {
      for (let i = 0; i < 6; i++) part(g, sphere(0.09, 10, 8), bio, sx * (1.34 - Math.abs(i - 2.5) * 0.06), 0.82, 1.2 - i * 1.15, 0, 0, 0, { shadow: false });
      part(g, rbox(0.05, 0.06, 6.0, 0.02), bio, sx * 1.2, 0.58, -1.6);
      plate(g, label, liv, sx * 1.42, 1.2, 0.2, sx * Math.PI / 2, 0.9);
      navLight(g, navLights, sx * 1.98, 0.72, -0.35, sx < 0 ? 0xff4d6a : 0x4dff9a);
      addEngine(g, flames, sx * 0.85, 0.95, -6.1, 1.25, neon, hull, L.trail);
    });
    const [pr, pl] = wingPair('leviFin', [[1.25, 1.0], [2.0, -0.2], [1.92, -0.5], [1.25, -0.3]], 0.1, 0.03);
    part(g, pr, paint, 0, 0.72, 0);
    part(g, pl, paint, 0, 0.72, 0);
    part(g, wingPair('leviFluke', [[0, -6.2], [0.35, -6.6], [1.8, -7.3], [1.55, -7.8], [0.3, -7.25], [0, -7.45], [-0.3, -7.25], [-1.55, -7.8], [-1.8, -7.3], [-0.35, -6.6]], 0.14, 0.04)[0], paint, 0, 1.45, 0);
    part(g, rbox(0.2, 0.6, 0.6, 0.06), hull, 0, 1.25, -6.35);
    for (const [sx, z] of [[-1, 1.6], [1, 1.6], [-1, -1.6], [1, -1.6], [-1, -4.6], [1, -4.6]]) leg(legs, sx * 0.85, z, 0.42, sx, steel, dark, 0.07);
    return grid(SLOT, CONTAINER, 3, 4, 1.92, -1.27);
  }

  /** Coloso: torre de mando, casco blindado con paredes, quitanieves al frente y 8 motores. */
  function coloso(g, label, flames, navLights, legs, L) {
    const { liv, dark, paint, neon, steel } = L;
    const armor = mat(L.hullColor, { rough: 0.45, metal: 0.55, env: 1.15, flat: true });
    part(g, rbox(3.6, 0.9, 8.3, 0.14), dark, 0, 0.75, -2.3);
    part(g, rbox(3.0, 0.12, 5.75, 0.05), mat(0xffffff, { map: bedTexture(3, 4), rough: 0.6 }), 0, 1.26, -2.7);
    // Torre de mando.
    part(g, rbox(2.6, 1.9, 2.0, 0.16), armor, 0, 2.0, 1.25);
    part(g, rbox(1.8, 0.6, 1.3, 0.12), armor, 0, 3.2, 1.05);
    part(g, rbox(2.4, 0.3, 0.06, 0.04), glass(), 0, 2.5, 2.27);
    part(g, rbox(1.6, 0.22, 0.06, 0.04), glass(), 0, 3.25, 1.71);
    part(g, rbox(2.66, 0.14, 2.04, 0.04), paint, 0, 1.25, 1.25);
    part(g, cyl(0.03, 0.03, 0.9, 6), steel, 0.6, 3.9, 1.0);
    part(g, lathe('colosoDish', [[0.001, 0], [0.3, 0.05], [0.5, 0.18], [0.001, 0.04]], 24), steel, -0.55, 3.6, 0.9, -0.5, 0.4, 0);
    part(g, profile('colosoPlow', [[0, 0.3], [0.65, 0.3], [1.05, 0.85], [0.65, 1.25], [0, 1.25]], 3.4, 0.06), mat(0x2a2f55, { rough: 0.4, metal: 0.6, flat: true }), 0, 0, 1.85);
    for (const x of [-1.1, -0.37, 0.37, 1.1]) part(g, rbox(0.42, 0.06, 0.05, 0.02), neon, x, 0.9, 2.88);
    both((sx) => {
      part(g, rbox(0.25, 1.4, 6.0, 0.05), armor, sx * 1.75, 1.4, -2.7);
      part(g, rbox(0.27, 0.1, 6.0, 0.03), paint, sx * 1.75, 2.12, -2.7);
      for (let z = -0.2; z > -5.6; z -= 1.08) part(g, rbox(0.06, 1.0, 0.6, 0.02), dark, sx * 1.89, 1.35, z);
      plate(g, label, liv, sx * 1.31, 2.1, 1.25, sx * Math.PI / 2, 1.0);
      navLight(g, navLights, sx * 1.32, 2.95, 2.0, sx < 0 ? 0xff4d6a : 0x4dff9a);
    });
    part(g, rbox(3.6, 1.8, 1.0, 0.16), armor, 0, 1.25, -6.85);
    part(g, rbox(3.66, 0.14, 1.04, 0.04), paint, 0, 2.1, -6.85);
    for (const y of [0.82, 1.62]) for (const x of [-1.2, -0.4, 0.4, 1.2]) addEngine(g, flames, x, y, -7.35, 0.92, neon, armor, L.trail);
    for (const [sx, z] of [[-1, 1.6], [1, 1.6], [-1, -2.2], [1, -2.2], [-1, -5.8], [1, -5.8]]) leg(legs, sx * 1.3, z, 0.32, sx, steel, dark, 0.08);
    return grid(SLOT, CONTAINER, 3, 4, 1.32, -1.27);
  }

  return { vencejo, libelula, halcon, raya, nomada, bisonte, nova, leviatan, coloso };
}

/**
 * Dónde van las piezas de la evolución en cada modelo: `boost` = góndola de impulso del lado derecho
 * (se refleja) y `top` = punto alto para el halo de Mk III. `s` = tamaño de las piezas.
 */
export const EVO_ANCHORS = {
  colibri: { boost: [0.6, 1.38, -1.45], top: [0, 2.35, -0.4], s: 1 },
  mula: { boost: [1.72, 1.62, -1.9], top: [0, 3.0, 1.1], s: 1.3 },
  titan: { boost: [1.2, 2.08, -6.0], top: [0, 3.25, 0.6], s: 1.6 },
  vencejo: { boost: [1.1, 1.64, -1.3], top: [0, 2.6, -0.2], s: 1 },
  libelula: { boost: [0.36, 1.32, -1.75], top: [0, 2.4, 0.3], s: 0.9 },
  halcon: { boost: [1.62, 1.58, 0.35], top: [0, 2.75, -0.45], s: 1 },
  raya: { boost: [1.5, 1.12, -1.2], top: [0, 2.75, -2.2], s: 1.3 },
  nomada: { boost: [1.05, 2.25, 0.1], top: [0, 3.2, -2.0], s: 1.3 },
  bisonte: { boost: [1.22, 1.88, -3.3], top: [0, 3.0, 1.05], s: 1.3 },
  nova: { boost: [1.9, 1.36, -5.55], top: [0, 3.0, -2.7], s: 1.6 },
  leviatan: { boost: [1.62, 1.15, -3.4], top: [0, 3.3, -2.7], s: 1.6 },
  coloso: { boost: [1.75, 2.38, -4.6], top: [0, 4.4, 1.0], s: 1.6 }
};
