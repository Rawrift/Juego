// Modelos 3D de Rift Cargo, armados por código con piezas redondeadas: contenedores, drones de carga
// (los "montacargas"), naves de carga, estanterías y pines. Todos miran hacia +Z.

import * as THREE from 'three';
import { C, LIVERY, hex } from './palette.js';
import { containerTexture, signTexture, bedTexture } from './textures.js';
import { rbox, cyl, sphere, lathe, mat, glass, glow, part, bake, profile, cached } from './kit.js';

export const CONTAINER = { w: 1.2, h: 0.8, d: 0.8 };

// ---------- Contenedor ----------

export function containerGeometry() {
  return rbox(CONTAINER.w, CONTAINER.h, CONTAINER.d, 0.07, 2);
}

export function containerMaterial(cargo) {
  return mat(0xffffff, { map: containerTexture(cargo), rough: 0.55 });
}

export function makeContainer(cargo) {
  const m = new THREE.Mesh(containerGeometry(), containerMaterial(cargo));
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.cargo = cargo;
  return m;
}

// ---------- Llama del motor ----------

let flameMat = null;
export function flameMaterial() {
  if (flameMat) return flameMat;
  flameMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        float a = 1.0 - vUv.y;
        float flick = 0.85 + 0.15 * sin(uTime * 40.0 + vUv.y * 12.0);
        vec3 col = mix(vec3(0.35,0.75,1.0), vec3(1.0), pow(a, 3.0));
        gl_FragColor = vec4(col * flick, pow(a, 1.6) * 0.85);
      }`
  });
  userUpdates.add((t) => { flameMat.uniforms.uTime.value = t; });
  return flameMat;
}

/** Funciones que se llaman en cada cuadro con el tiempo (animaciones compartidas). */
export const userUpdates = new Set();

let glowSpriteMat = null;
function glowSprite(color = 0x9fe3ff, size = 1) {
  if (!glowSpriteMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    glowSpriteMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }
  const s = new THREE.Sprite(glowSpriteMat.clone());
  s.material.color.setHex(color);
  s.scale.setScalar(size);
  s.userData.live = true;
  return s;
}

// ---------- Drone de carga ----------

export const DRONE_SCALE = 1.3;

/**
 * Drone amarillo con cuatro rotores carenados y horquillas (un montacargas que vuela).
 * userData.rotors: discos que giran · userData.hook: donde se cuelga el contenedor.
 */
export function makeDrone() {
  const g = new THREE.Group();
  const yellow = mat(C.yellow, { rough: 0.5 });
  const navy = mat(C.navy, { rough: 0.55 });
  const white = mat(C.white, { rough: 0.5 });
  const steel = mat(C.steel, { rough: 0.45, metal: 0.3 });

  part(g, rbox(0.66, 0.24, 0.5, 0.09), yellow, 0, 0, 0);
  part(g, rbox(0.42, 0.08, 0.32, 0.04), navy, 0, 0.15, -0.02);
  part(g, rbox(0.3, 0.12, 0.06, 0.03), glass(), 0, 0.03, 0.26);
  part(g, rbox(0.16, 0.035, 0.02, 0.012), glow(C.glow, 2.2), 0, 0.04, 0.29);
  // Brazos y rotores carenados.
  const duct = lathe('duct', [[0.15, -0.05], [0.19, -0.04], [0.2, 0.03], [0.18, 0.06], [0.15, 0.05]], 28);
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = sx * 0.43;
    const z = sz * 0.36;
    part(g, rbox(0.34, 0.06, 0.08, 0.03), yellow, sx * 0.25, 0.04, sz * 0.22, 0, Math.atan2(sz * 0.36, sx * 0.43) * -1, 0);
    part(g, duct, white, x, 0.06, z);
    part(g, cyl(0.035, 0.035, 0.06, 12), navy, x, 0.06, z);
    const rotor = new THREE.Group();
    rotor.position.set(x, 0.07, z);
    rotor.userData.live = true;
    const blade = part(rotor, rbox(0.3, 0.01, 0.045, 0.005, 1), mat(C.navy, { rough: 0.5 }), 0, 0, 0, 0, 0, 0, { shadow: false });
    blade.userData.live = true;
    const blur = part(rotor, cached('rotorBlur', () => new THREE.CircleGeometry(0.15, 24).rotateX(-Math.PI / 2)), mat(0xa9b4de, { transparent: true, opacity: 0.25 }), 0, 0.002, 0, 0, 0, 0, { shadow: false, receive: false });
    blur.userData.live = true;
    g.add(rotor);
    rotors.push(rotor);
  }
  // Horquillas: dos uñas por delante y abajo, como un autoelevador.
  part(g, rbox(0.5, 0.08, 0.08, 0.03), steel, 0, -0.16, 0.12);
  for (const sx of [-1, 1]) {
    part(g, rbox(0.06, 0.24, 0.06, 0.02), steel, sx * 0.2, -0.24, 0.12);
    part(g, rbox(0.06, 0.04, 0.42, 0.015), steel, sx * 0.2, -0.36, -0.06);
  }
  // Patas.
  for (const sx of [-1, 1]) part(g, rbox(0.05, 0.05, 0.5, 0.02), navy, sx * 0.26, -0.18, -0.05);
  // Luz de posición.
  const beacon = part(g, sphere(0.035, 10, 8), glow(0xff9a3c, 2.5), 0, 0.21, -0.12, 0, 0, 0, { shadow: false });
  beacon.userData.live = true;

  bake(g);
  g.scale.setScalar(DRONE_SCALE);
  g.userData.rotors = rotors;
  g.userData.beacon = beacon;
  g.userData.hook = new THREE.Vector3(0, -0.36 - CONTAINER.h / 2 - 0.02, -0.06);
  return g;
}

// ---------- Naves de carga ----------
// Cada modelo tiene su propia silueta (no es la misma nave más grande) y su color de librea:
// Colibrí (correo veloz, cian), Mula (camión de plataforma, magenta), Titán (carguero pesado, dorado).

export const SHIP_LOOKS = {
  colibri: { cols: 2, rows: 1, livery: LIVERY.colibri },
  mula: { cols: 2, rows: 3, livery: LIVERY.mula },
  titan: { cols: 3, rows: 4, livery: LIVERY.titan }
};

export const SLOT = { x: 0.92, z: 1.34 };

/** Medidas de cada nave: cuánto sobresale hacia adelante y hacia atrás de su origen, alto y ancho. */
const DIMS = {
  colibri: { front: 2.1, back: 2.9, height: 1.95, width: 2.6 },
  mula: { front: 2.15, back: 4.5, height: 2.45, width: 4.3 },
  titan: { front: 3.25, back: 7.3, height: 3.0, width: 3.9 }
};

export function shipDims(model) {
  const d = DIMS[model];
  return { ...SHIP_LOOKS[model], ...d, length: d.front + d.back };
}

/** Motor: carcasa, aro del color de la librea, tobera, brillo y llama. Apunta hacia atrás (-Z). */
function addEngine(g, flames, x, y, z, s, ring, shell) {
  const housing = lathe('engHousing', [[0.001, 0], [0.14, 0.02], [0.21, 0.1], [0.23, 0.32], [0.22, 0.5], [0.17, 0.56]], 28);
  const nozzle = lathe('engNozzle', [[0.15, 0], [0.19, 0.1], [0.25, 0.26], [0.27, 0.3], [0.23, 0.3], [0.17, 0.16], [0.12, 0.08]], 28);
  const e = new THREE.Group();
  e.position.set(x, y, z);
  e.rotation.x = -Math.PI / 2;
  e.scale.setScalar(s);
  part(e, housing, shell, 0, 0, 0);
  part(e, cyl(0.235, 0.235, 0.08, 28), ring, 0, 0.3, 0);
  part(e, nozzle, mat(C.steel, { rough: 0.4, metal: 0.5 }), 0, 0.5, 0);
  part(e, cached('nozzleGlow', () => new THREE.CircleGeometry(0.15, 20).rotateX(-Math.PI / 2)), glow(0x9ff3ff, 2.6), 0, 0.62, 0, 0, 0, 0, { shadow: false });
  const flame = new THREE.Mesh(cached('flame', () => {
    // Ancha en la tobera (y = 0) y en punta hacia atrás (y = 1).
    const fg = new THREE.ConeGeometry(0.17, 1, 18, 1, true);
    fg.translate(0, 0.5, 0);
    return fg;
  }), flameMaterial());
  flame.position.y = 0.66;
  flame.userData.live = true;
  flame.scale.set(1, 0.001, 1);
  e.add(flame);
  const halo = glowSprite(0x7fe8ff, 0.9);
  halo.position.y = 0.75;
  e.add(halo);
  flame.userData.halo = halo;
  flames.push(flame);
  g.add(e);
  return e;
}

/** Matrícula pintada (por ejemplo "RC-101") para distinguir naves del mismo modelo. */
function plate(g, label, livery, x, y, z, ry, w = 0.9) {
  const tex = signTexture(label, { bg: '#070a1e', fg: hex(livery), w: 256, h: 80, size: 46, radius: 18 });
  const m = part(g, cached(`plate:${w}`, () => new THREE.PlaneGeometry(w, w * 0.31)), mat(0xffffff, { map: tex, rough: 0.5, emissive: 0xffffff, ei: 0.15 }), x, y, z, 0, ry, 0, { shadow: false });
  m.receiveShadow = true;
  return m;
}

function navLight(g, list, x, y, z, color) {
  const nl = part(g, sphere(0.06, 10, 8), glow(color, 2.8), x, y, z, 0, 0, 0, { shadow: false });
  nl.userData.live = true;
  list.push(nl);
}

/** Pata de aterrizaje con su apoyo. */
function leg(legs, x, z, h, sx, steel, dark, r = 0.05) {
  part(legs, cyl(r, r, h, 8), steel, x, h / 2, z, 0, 0, sx * 0.22);
  part(legs, cyl(r * 3, r * 3.4, 0.06, 16), dark, x + sx * h * 0.1, 0.03, z);
}

/** Colibrí: fuselaje fino con domo, un contenedor a cada lado, motor central grande y esquíes. */
function buildColibri(g, label, flames, navLights, legs) {
  const liv = SHIP_LOOKS.colibri.livery;
  const hull = mat(C.white, { rough: 0.38, metal: 0.3, env: 1.2 });
  const dark = mat(0x232a55, { rough: 0.5, metal: 0.3 });
  const paint = mat(liv, { rough: 0.35, emissive: liv, ei: 0.25 });
  const neon = glow(liv, 2.2);
  const steel = mat(C.steel, { rough: 0.45, metal: 0.4 });
  const body = cached('colibriBody', () => {
    const geo = lathe('colibriLathe', [[0.001, 0], [0.3, 0.05], [0.46, 0.35], [0.55, 1.0], [0.57, 2.4], [0.5, 3.3], [0.36, 3.85], [0.17, 4.12], [0.001, 4.2]], 40).clone();
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -2.15);
    return geo;
  });
  part(g, body, hull, 0, 1.0, 0);
  // Domo de la cabina y su reflejo.
  const dome = part(g, sphere(0.42, 28, 18), glass(), 0, 1.38, 0.95);
  dome.scale.set(0.95, 0.62, 1.45);
  part(g, rbox(0.3, 0.03, 0.5, 0.01), mat(0xffffff, { emissive: 0xffffff, ei: 0.5 }), -0.12, 1.62, 1.1, 0.2, 0, 0, { shadow: false });
  // Anillos de color en el fuselaje.
  for (const z of [0.45, -1.2]) part(g, cyl(0.585, 0.585, 0.12, 36), z > 0 ? neon : paint, 0, 1.0, z, Math.PI / 2, 0, 0);
  // Brazos y cunas laterales para los dos contenedores.
  for (const sx of [-1, 1]) {
    part(g, rbox(0.75, 0.14, 1.2, 0.05), dark, sx * 0.62, 0.92, -0.2);
    part(g, rbox(0.98, 0.1, 1.5, 0.04), dark, sx * 1.08, 0.48, -0.2);
    part(g, rbox(0.1, 0.5, 0.1, 0.03), steel, sx * 1.08, 0.72, 0.55);
    part(g, rbox(1.02, 0.12, 0.14, 0.04), paint, sx * 1.08, 0.52, 0.56);
    // Propulsor chico detrás de cada cuna.
    addEngine(g, flames, sx * 1.08, 0.62, -1.0, 0.75, paint, hull);
    navLight(g, navLights, sx * 1.62, 0.56, 0.52, sx < 0 ? 0xff4d6a : 0x4dff9a);
  }
  // Motor principal y deriva de cola.
  addEngine(g, flames, 0, 1.0, -2.2, 1.85, neon, hull);
  part(g, profile('colibriFin', [[0, 0], [0.95, 0], [0.35, 0.72], [0.05, 0.72]], 0.09, 0.03), paint, 0, 1.45, -2.0);
  plate(g, label, liv, 0.06, 1.88, -1.55, Math.PI / 2, 0.62);
  plate(g, label, liv, -0.06, 1.88, -1.55, -Math.PI / 2, 0.62);
  // Faro delantero.
  part(g, rbox(0.3, 0.08, 0.06, 0.02), glow(0xe8fbff, 2), 0, 0.82, 2.0);
  // Esquíes de aterrizaje.
  for (const sx of [-1, 1]) {
    part(legs, rbox(0.1, 0.07, 3.0, 0.03), dark, sx * 0.42, 0.04, -0.1);
    for (const z of [0.8, -1.0]) part(legs, cyl(0.035, 0.035, 0.5, 8), steel, sx * 0.4, 0.3, z, 0, 0, sx * 0.15);
  }
  return [new THREE.Vector3(-1.08, 0.53 + CONTAINER.h / 2, -0.2), new THREE.Vector3(1.08, 0.53 + CONTAINER.h / 2, -0.2)];
}

/** Mula: cabina alta y cuadrada, plataforma con 6 contenedores y dos motores laterales grandes. */
function buildMula(g, label, flames, navLights, legs) {
  const liv = SHIP_LOOKS.mula.livery;
  const hull = mat(C.white, { rough: 0.4, metal: 0.25, env: 1.1 });
  const dark = mat(0x222852, { rough: 0.5, metal: 0.3 });
  const paint = mat(liv, { rough: 0.35, emissive: liv, ei: 0.22 });
  const neon = glow(liv, 2.3);
  const steel = mat(C.steel, { rough: 0.45, metal: 0.4 });
  // Cabina: arriba acero, abajo la franja de color, parabrisas ancho y barra de luces.
  part(g, rbox(2.3, 1.25, 1.95, 0.2), hull, 0, 1.68, 1.08);
  part(g, rbox(2.36, 0.62, 2.0, 0.16), paint, 0, 0.82, 1.08);
  part(g, rbox(2.12, 0.5, 0.08, 0.05), glass(), 0, 1.86, 2.07);
  for (const sx of [-1, 1]) part(g, rbox(0.06, 0.42, 0.9, 0.04), glass(), sx * 1.16, 1.9, 1.35);
  part(g, rbox(1.6, 0.08, 0.2, 0.03), neon, 0, 2.36, 1.6);
  for (const sx of [-1, 1]) part(g, rbox(0.42, 0.12, 0.05, 0.02), glow(0xe8fbff, 2), sx * 0.72, 0.9, 2.1);
  part(g, rbox(1.9, 0.16, 0.06, 0.03), dark, 0, 0.62, 2.1);
  plate(g, label, liv, 1.19, 1.42, 1.0, Math.PI / 2);
  plate(g, label, liv, -1.19, 1.42, 1.0, -Math.PI / 2);
  // Chasis y plataforma.
  part(g, rbox(2.4, 0.34, 4.7, 0.1), dark, 0, 0.42, -2.25);
  part(g, rbox(2.2, 0.1, 4.3, 0.04), mat(0xffffff, { map: bedTexture(2, 3), rough: 0.6 }), 0, 0.64, -2.25);
  part(g, rbox(2.34, 1.15, 0.16, 0.05), dark, 0, 1.15, -0.05);
  part(g, rbox(2.36, 0.1, 0.18, 0.04), neon, 0, 1.76, -0.05);
  for (const sx of [-1, 1]) part(g, rbox(0.08, 0.12, 4.3, 0.03), paint, sx * 1.12, 0.74, -2.25);
  // Góndolas de motor a los costados, con pilones.
  for (const sx of [-1, 1]) {
    const pod = cached('mulaPod', () => {
      const geo = lathe('mulaPodLathe', [[0.001, 0], [0.28, 0.08], [0.42, 0.4], [0.45, 1.6], [0.36, 2.1], [0.001, 2.25]], 32).clone();
      geo.rotateX(-Math.PI / 2);
      return geo;
    });
    part(g, pod, hull, sx * 1.72, 0.98, -1.6);
    part(g, cyl(0.46, 0.46, 0.14, 32), paint, sx * 1.72, 0.98, -2.6, Math.PI / 2, 0, 0);
    part(g, rbox(0.7, 0.16, 0.9, 0.05), dark, sx * 1.36, 0.82, -2.6);
    addEngine(g, flames, sx * 1.72, 1.16, -3.8, 1.0, neon, hull);
    addEngine(g, flames, sx * 1.72, 0.76, -3.8, 1.0, neon, hull);
    navLight(g, navLights, sx * 2.18, 0.98, -1.45, sx < 0 ? 0xff4d6a : 0x4dff9a);
  }
  for (const [sx, z] of [[-1, 1.4], [1, 1.4], [-1, -3.9], [1, -3.9]]) leg(legs, sx * 1.0, z, 0.45, sx, steel, dark, 0.06);
  const slots = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) slots.push(new THREE.Vector3((c - 0.5) * SLOT.x, 0.69 + CONTAINER.h / 2, -0.82 - r * SLOT.z));
  return slots;
}

/** Titán: columna de reticulado, puente de mando, 12 contenedores, bloque de 6 motores y radiadores. */
function buildTitan(g, label, flames, navLights, legs) {
  const liv = SHIP_LOOKS.titan.livery;
  const hull = mat(0x56609a, { rough: 0.36, metal: 0.5, env: 1.2 });
  const dark = mat(0x1d2348, { rough: 0.5, metal: 0.35 });
  const paint = mat(liv, { rough: 0.35, emissive: liv, ei: 0.2 });
  const neon = glow(liv, 2.4);
  const steel = mat(C.steel, { rough: 0.45, metal: 0.45 });
  // Columna de reticulado (cuatro largueros y riostras cruzadas).
  for (const x of [-0.45, 0.45]) for (const y of [0.4, 0.95]) part(g, rbox(0.14, 0.14, 7.2, 0.04), steel, x, y, -2.4);
  for (let z = 0.8; z > -6; z -= 1.0) {
    part(g, rbox(1.0, 0.1, 0.1, 0.03), steel, 0, 0.4, z);
    part(g, rbox(1.0, 0.1, 0.1, 0.03), steel, 0, 0.95, z);
    for (const x of [-0.45, 0.45]) part(g, rbox(0.08, 0.66, 0.08, 0.02), steel, x, 0.68, z - 0.5, 0.6, 0, 0);
  }
  // Cuna de carga arriba de la columna.
  part(g, rbox(3.0, 0.12, 5.75, 0.05), mat(0xffffff, { map: bedTexture(3, 4), rough: 0.6 }), 0, 1.08, -2.7);
  for (const sx of [-1, 1]) part(g, rbox(0.1, 0.16, 5.75, 0.04), paint, sx * 1.48, 1.16, -2.7);
  // Puente de mando en cuña, con ventanal y franja dorada.
  part(g, profile('titanBridge', [[0, 0.3], [1.7, 0.3], [2.3, 0.95], [1.95, 2.25], [0.25, 2.45], [0, 2.25]], 2.7, 0.12), hull, 0, 0, 0.7);
  part(g, rbox(2.5, 0.42, 0.06, 0.04), glass(), 0, 1.9, 2.77, -0.52, 0, 0);
  part(g, rbox(2.75, 0.14, 1.9, 0.05), paint, 0, 1.0, 1.65);
  // Ventanales a los costados del puente y franjas doradas.
  for (const sx of [-1, 1]) {
    part(g, rbox(0.06, 0.34, 1.35, 0.04), glass(), sx * 1.37, 1.85, 1.55);
    part(g, rbox(0.05, 0.06, 1.5, 0.02), neon, sx * 1.38, 2.08, 1.55);
    part(g, rbox(0.05, 0.12, 2.0, 0.03), paint, sx * 1.38, 0.62, 1.6);
  }
  part(g, rbox(0.9, 0.08, 0.9, 0.04), paint, 0, 2.5, 0.9, 0, Math.PI / 4, 0);
  part(g, rbox(2.2, 0.08, 0.08, 0.03), neon, 0, 2.52, 1.4);
  part(g, cyl(0.03, 0.03, 0.9, 6), steel, 0.8, 2.95, 1.0);
  part(g, lathe('titanDish', [[0.001, 0], [0.3, 0.05], [0.5, 0.18], [0.001, 0.04]], 24), hull, -0.7, 2.6, 1.0, -0.5, 0.4, 0);
  plate(g, label, liv, 1.42, 1.55, 1.6, Math.PI / 2, 1.0);
  plate(g, label, liv, -1.42, 1.55, 1.6, -Math.PI / 2, 1.0);
  for (const sx of [-1, 1]) part(g, rbox(0.4, 0.1, 0.05, 0.02), glow(0xe8fbff, 2), sx * 0.85, 0.7, 3.0);
  // Bloque de motores con 6 toberas y radiadores con borde encendido.
  part(g, rbox(3.1, 1.6, 1.3, 0.18), dark, 0, 1.05, -6.15);
  part(g, rbox(3.16, 0.16, 1.34, 0.06), paint, 0, 1.6, -6.15);
  for (const r of [0, 1]) for (const c of [-1, 0, 1]) addEngine(g, flames, c * 0.98, 0.7 + r * 0.72, -6.85, 1.3, neon, hull);
  for (const sx of [-1, 1]) {
    for (const k of [0, 1]) {
      const fin = new THREE.Group();
      fin.position.set(sx * 1.6, 1.3 + k * 0.05, -5.7 - k * 0.75);
      fin.rotation.z = sx * -0.5;
      part(fin, rbox(0.06, 1.35, 0.6, 0.02), mat(0x3a4378, { rough: 0.5, metal: 0.4 }), 0, 0.6, 0);
      part(fin, rbox(0.08, 0.06, 0.62, 0.02), neon, 0, 1.28, 0);
      g.add(fin);
    }
    navLight(g, navLights, sx * 1.56, 1.2, 2.2, sx < 0 ? 0xff4d6a : 0x4dff9a);
  }
  for (const [sx, z] of [[-1, 1.8], [1, 1.8], [-1, -2.0], [1, -2.0], [-1, -5.8], [1, -5.8]]) leg(legs, sx * 1.15, z, 0.5, sx, steel, dark, 0.07);
  const slots = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) slots.push(new THREE.Vector3((c - 1) * SLOT.x, 1.14 + CONTAINER.h / 2, -0.6 - SLOT.z / 2 - r * SLOT.z));
  return slots;
}

const BUILDERS = { colibri: buildColibri, mula: buildMula, titan: buildTitan };

/**
 * Nave de carga. userData.slots: posiciones locales de los contenedores (de adelante hacia atrás);
 * userData.flames: llamas de los motores (escalar en Z según el empuje); userData.cargo: grupo donde
 * van los contenedores; userData.legs: patas de aterrizaje. `label` es la matrícula pintada.
 */
export function makeShip(model, label = 'RC') {
  const g = new THREE.Group();
  const flames = [];
  const navLights = [];
  const legs = new THREE.Group();
  legs.userData.live = true;
  const slots = BUILDERS[model](g, label, flames, navLights, legs);
  g.add(legs);
  bake(g);
  const cargo = new THREE.Group();
  cargo.userData.live = true;
  g.add(cargo);
  g.userData = { ...g.userData, slots, flames, cargo, legs, navLights, model, dims: shipDims(model) };
  return g;
}

/** Pone `n` contenedores del tipo `cargoType` en la nave (o los saca). */
export function setShipCargo(ship, cargoType, n) {
  const holder = ship.userData.cargo;
  const want = cargoType ? n : 0;
  while (holder.children.length > want) holder.remove(holder.children[holder.children.length - 1]);
  for (const ch of holder.children) {
    if (ch.userData.cargo === cargoType) continue;
    ch.material = containerMaterial(cargoType);
    ch.userData.cargo = cargoType;
  }
  while (holder.children.length < want && holder.children.length < ship.userData.slots.length) {
    const c = makeContainer(cargoType);
    const s = ship.userData.slots[holder.children.length];
    c.position.copy(s);
    c.rotation.y = Math.PI / 2;
    c.userData.live = true;
    holder.add(c);
  }
}

/** Empuje visual de los motores, de 0 (apagados) a 1. */
export function setThrust(ship, k, t = 0) {
  for (const f of ship.userData.flames) {
    const flick = 1 + Math.sin(t * 31 + f.id) * 0.06;
    f.scale.set(1, Math.max(0.001, k * 1.25 * flick), 1);
    f.visible = k > 0.02;
    f.userData.halo.visible = k > 0.02;
    f.userData.halo.material.opacity = Math.min(1, k * 1.2);
  }
}

// ---------- Estantería (rack) ----------

export const RACK = { cols: 3, deep: 2, levels: 2, pitchX: 1.38, pitchZ: 0.98, levelY: [0.16, 1.2], height: 2.2 };

/** Módulo de estantería de 12 lugares (3 de ancho, 2 de fondo, 2 niveles). userData.slots en local. */
export function makeRack() {
  const g = new THREE.Group();
  const blue = mat(0x3a4290, { rough: 0.45, metal: 0.3 });
  const orange = mat(C.blue, { rough: 0.4, emissive: C.blue, ei: 0.35 });
  const deck = mat(0x2a3164, { rough: 0.6, metal: 0.2 });
  const W = RACK.cols * RACK.pitchX + 0.1;
  const D = RACK.deep * RACK.pitchZ + 0.05;
  for (let i = 0; i <= RACK.cols; i++) {
    const x = -W / 2 + (i * (W - 0.02)) / RACK.cols + 0.01;
    for (const sz of [-1, 1]) part(g, rbox(0.09, RACK.height, 0.09, 0.025), blue, x, RACK.height / 2, sz * D / 2);
    // Riostras del lateral.
    part(g, rbox(0.04, 0.04, D, 0.015), blue, x, 0.7, 0);
    part(g, rbox(0.04, 0.04, D, 0.015), blue, x, 1.75, 0);
  }
  for (const y of [RACK.levelY[0] - 0.06, RACK.levelY[1] - 0.06]) {
    for (const sz of [-1, 1]) part(g, rbox(W, 0.11, 0.07, 0.025), orange, 0, y, sz * D / 2);
    part(g, rbox(W - 0.1, 0.025, D - 0.04, 0.01), deck, 0, y + 0.04, 0);
  }
  part(g, rbox(W + 0.1, 0.06, D + 0.1, 0.03), mat(0x232a58, { rough: 0.7 }), 0, 0.03, 0);
  bake(g);
  const slots = [];
  for (let lv = 0; lv < RACK.levels; lv++) {
    for (let dz = 0; dz < RACK.deep; dz++) {
      for (let cx = 0; cx < RACK.cols; cx++) {
        slots.push(new THREE.Vector3((cx - (RACK.cols - 1) / 2) * RACK.pitchX, RACK.levelY[lv] + CONTAINER.h / 2, (dz - (RACK.deep - 1) / 2) * RACK.pitchZ));
      }
    }
  }
  g.userData.slots = slots;
  g.userData.size = { w: W, d: D };
  return g;
}

// ---------- Pin de ubicación ----------

/** Pin azul como los de un mapa, con el centro blanco. Gira para mirar a la cámara. */
export function makePin(color = C.blue) {
  const g = new THREE.Group();
  const head = new THREE.Group();
  const pts = [[0.001, 0], [0.06, 0.12], [0.16, 0.36], [0.27, 0.6], [0.33, 0.78], [0.34, 0.92], [0.3, 1.06], [0.21, 1.17], [0.1, 1.23], [0.001, 1.25]];
  const body = part(head, lathe('pin', pts, 32), mat(color, { rough: 0.35, env: 1.2 }), 0, 0, 0);
  body.castShadow = true;
  const dot = part(head, cached('pinDot', () => new THREE.CircleGeometry(0.15, 28)), mat(0xffffff, { rough: 0.4, emissive: 0xffffff, ei: 0.35 }), 0, 0.88, 0.335, 0, 0, 0, { shadow: false });
  dot.userData.live = true;
  head.userData.live = true;
  g.add(head);
  g.userData.head = head;
  return g;
}
