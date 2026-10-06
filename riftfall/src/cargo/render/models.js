// Modelos 3D de Rift Cargo, armados por código con piezas redondeadas: contenedores, drones de carga
// (los "montacargas"), naves de carga, estanterías y pines. Todos miran hacia +Z.

import * as THREE from 'three';
import { C } from './palette.js';
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
    const blur = part(rotor, cached('rotorBlur', () => new THREE.CircleGeometry(0.15, 24).rotateX(-Math.PI / 2)), mat(0x8b96b8, { transparent: true, opacity: 0.25 }), 0, 0.002, 0, 0, 0, 0, { shadow: false, receive: false });
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

export const SHIP_LOOKS = {
  // Liviana: cabina azul, 2 contenedores en fila.
  colibri: { cols: 1, rows: 2, cabW: 1.35, cabL: 1.6, cabH: 1.78, engines: 2, cab: C.blue, stripe: C.white, trim: C.yellow, rail: C.blue, skirt: C.navy },
  // Mediana: cabina blanca con franja azul, 2x3 contenedores.
  mula: { cols: 2, rows: 3, cabW: 2.15, cabL: 1.9, cabH: 1.95, engines: 4, cab: C.white, stripe: C.blue, trim: C.blue, rail: C.blue, skirt: C.navy },
  // Pesada: cabina azul oscuro con puente de mando, 3x4 contenedores.
  titan: { cols: 3, rows: 4, cabW: 3.05, cabL: 2.35, cabH: 2.0, engines: 6, cab: C.navy, stripe: C.orange, trim: C.orange, rail: C.orange, skirt: C.steel, bridge: true }
};

export const SLOT = { x: 0.92, z: 1.34 };

/** Medidas útiles de una nave (para estacionarla y ubicar la carga). */
export function shipDims(model) {
  const L = SHIP_LOOKS[model];
  const bedL = L.rows * SLOT.z + 0.25;
  return { ...L, bedL, length: L.cabL + bedL + 0.9, width: Math.max(L.cabW, L.cols * SLOT.x + 0.5) + 0.8 };
}

/** Alerón horizontal (envergadura hacia el lado `side`, cuerda hacia adelante). */
function finGeometry(side) {
  return cached(`fin:${side}`, () => {
    let pts = [[0, 0], [0, 1.05], [0.85, 0.5], [0.85, 0.15]].map(([u, v]) => [u * side, v]);
    if (side < 0) pts = pts.reverse();
    const shape = new THREE.Shape();
    pts.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
    shape.closePath();
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
    fg.rotateX(Math.PI / 2);
    fg.computeVertexNormals();
    return fg;
  });
}

/**
 * Nave de carga. userData.slots: posiciones locales de los contenedores (de adelante hacia atrás);
 * userData.flames: llamas de los motores (escalar en Z según el empuje); userData.cargo: grupo donde
 * van los contenedores; userData.legs: patas de aterrizaje.
 */
export function makeShip(model) {
  const L = shipDims(model);
  const g = new THREE.Group();
  const cabMat = mat(L.cab, { rough: 0.42, env: 1.1 });
  const stripe = mat(L.stripe, { rough: 0.45 });
  const trim = mat(L.trim, { rough: 0.5 });
  const white = mat(C.white, { rough: 0.48 });
  const light = mat(0xdde3f3, { rough: 0.55 });
  const steel = mat(C.steel, { rough: 0.45, metal: 0.35 });
  const dark = mat(0x2a3354, { rough: 0.5, metal: 0.2 });

  const { cabW, cabL, cabH, bedL, cols, rows } = L;
  const floor = 0.42;

  // Cabina: perfil lateral (z, y) con el parabrisas inclinado y el techo redondeado, extruido de canto.
  const cabPts = [
    [-0.1, floor], [cabL - 0.22, floor], [cabL, floor + 0.24], [cabL, floor + 0.58],
    [cabL * 0.68, cabH - 0.1], [cabL * 0.58, cabH], [0.12, cabH], [-0.1, cabH - 0.16]
  ];
  part(g, profile(`cab:${model}`, cabPts, cabW, 0.1), cabMat, 0, 0, 0);
  // Faldón de otro color abajo (dos tonos, como un camión).
  part(g, rbox(cabW + 0.05, 0.26, cabL + 0.12, 0.09), mat(L.skirt, { rough: 0.5 }), 0, floor + 0.11, cabL / 2 - 0.06);
  // Parabrisas: una placa de vidrio sobre la pendiente, con un reflejo.
  {
    const a = new THREE.Vector2(cabL - 0.03, floor + 0.62);
    const b = new THREE.Vector2(cabL * 0.69 + 0.05, cabH - 0.14);
    const len = a.distanceTo(b);
    const phi = Math.atan2(b.x - a.x, b.y - a.y);
    const w = part(g, rbox(cabW * 0.84, len, 0.05, 0.02), glass(), 0, (a.y + b.y) / 2 + 0.03, (a.x + b.x) / 2 + 0.035, phi, 0, 0);
    part(w, rbox(cabW * 0.5, 0.035, 0.02, 0.01), mat(0xffffff, { emissive: 0xffffff, ei: 0.4, rough: 0.3 }), -cabW * 0.1, len * 0.18, 0.03, 0, 0, 0, { shadow: false });
  }
  // Ventanas laterales, franja y faros.
  for (const sx of [-1, 1]) {
    part(g, rbox(0.05, 0.36, cabL * 0.42, 0.05), glass(), sx * (cabW / 2 + 0.005), cabH - 0.36, cabL * 0.33);
    part(g, rbox(0.04, 0.1, cabL * 0.98, 0.03), stripe, sx * (cabW / 2 + 0.01), floor + 0.5, cabL * 0.44);
    part(g, rbox(0.16, 0.1, 0.04, 0.03), glow(0xfff4d6, 1.8), sx * cabW * 0.32, floor + 0.38, cabL + 0.005);
  }
  part(g, rbox(cabW * 0.92, 0.14, 0.1, 0.05), light, 0, floor + 0.12, cabL - 0.1);
  // Baliza y antena en el techo.
  part(g, rbox(0.34, 0.08, 0.16, 0.04), trim, 0, cabH + 0.05, 0.35);
  part(g, cyl(0.015, 0.015, 0.45, 6), steel, cabW * 0.3, cabH + 0.22, 0.15);
  if (L.bridge) {
    part(g, rbox(cabW * 0.55, 0.5, 0.9, 0.12), cabMat, 0, cabH + 0.25, 0.35);
    part(g, rbox(cabW * 0.5, 0.18, 0.05, 0.03), glass(), 0, cabH + 0.32, 0.81);
    for (const sx of [-1, 1]) part(g, rbox(0.04, 0.16, 0.6, 0.03), glass(), sx * cabW * 0.276, cabH + 0.32, 0.35);
  }
  // Logo en las puertas.
  const logo = mat(0xffffff, { map: signTexture('RC', { bg: '#ffffff', fg: '#2f5fe8', w: 128, h: 128, size: 60, radius: 30 }), rough: 0.5 });
  for (const sx of [-1, 1]) {
    const p = part(g, cached('logoPlane', () => new THREE.PlaneGeometry(0.34, 0.34)), logo, sx * (cabW / 2 + 0.03), floor + 0.85, cabL * 0.62, 0, sx * Math.PI / 2, 0, { shadow: false });
    p.receiveShadow = true;
  }

  // Chasis: viga central, piso de carga, barandas y mampara detrás de la cabina.
  const bedW = cols * SLOT.x + 0.3;
  part(g, rbox(Math.min(cabW * 0.55, 1.2), 0.3, bedL + 0.7, 0.1), dark, 0, 0.36, -bedL / 2 - 0.15);
  part(g, rbox(bedW, 0.12, bedL, 0.05), mat(0xffffff, { map: bedTexture(cols, rows), rough: 0.6 }), 0, 0.58, -bedL / 2 - 0.1);
  for (const sx of [-1, 1]) part(g, rbox(0.08, 0.1, bedL, 0.03), mat(L.rail, { rough: 0.45 }), sx * (bedW / 2 - 0.02), 0.66, -bedL / 2 - 0.1);
  part(g, rbox(bedW + 0.1, 1.0, 0.12, 0.05), white, 0, 1.1, -0.18);
  part(g, rbox(bedW + 0.12, 0.1, 0.14, 0.04), trim, 0, 1.58, -0.18);
  // Poste trasero.
  part(g, rbox(bedW * 0.7, 0.55, 0.1, 0.04), light, 0, 0.88, -bedL - 0.12);

  // Motores: carcasa blanca, tobera oscura, aro de color y brillo en la salida.
  const housing = lathe('engHousing', [[0.001, 0], [0.14, 0.02], [0.21, 0.1], [0.23, 0.32], [0.22, 0.5], [0.17, 0.56]], 28);
  const nozzle = lathe('engNozzle', [[0.15, 0], [0.19, 0.1], [0.25, 0.26], [0.27, 0.3], [0.23, 0.3], [0.17, 0.16], [0.12, 0.08]], 28);
  const flames = [];
  const engY = 0.62;
  const engZ = -bedL - 0.25;
  const n = L.engines;
  const perRow = n <= 2 ? n : n / 2;
  const rowsE = n <= 2 ? 1 : 2;
  const spread = Math.max(bedW, cabW) * 0.8;
  for (let r = 0; r < rowsE; r++) {
    for (let i = 0; i < perRow; i++) {
      const x = perRow === 1 ? 0 : (i / (perRow - 1) - 0.5) * spread;
      const y = rowsE === 1 ? engY : engY - 0.12 + r * 0.5;
      const e = new THREE.Group();
      e.position.set(x, y, engZ);
      e.rotation.x = -Math.PI / 2;
      e.scale.setScalar(L.engines > 2 ? 1.15 : 1.3);
      part(e, housing, white, 0, 0, 0);
      part(e, cyl(0.235, 0.235, 0.08, 28), trim, 0, 0.3, 0);
      part(e, nozzle, steel, 0, 0.5, 0);
      part(e, cached('nozzleGlow', () => new THREE.CircleGeometry(0.15, 20).rotateX(-Math.PI / 2)), glow(0x9fe3ff, 2.4), 0, 0.62, 0, 0, 0, 0, { shadow: false });
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
      const halo = glowSprite(0x7fd0ff, 0.9);
      halo.position.y = 0.75;
      e.add(halo);
      flame.userData.halo = halo;
      flames.push(flame);
      // Soporte que une el motor al chasis.
      part(g, rbox(0.12, 0.12, 0.5, 0.04), dark, x * 0.85, y, engZ + 0.35);
      g.add(e);
    }
  }

  // Alerones traseros con punta de color y luces de navegación.
  const navLights = [];
  for (const sx of [-1, 1]) {
    const fin = part(g, finGeometry(sx), white, sx * (bedW / 2 - 0.05), 0.62, -bedL + 0.05, 0, 0, sx * 0.12);
    fin.castShadow = true;
    part(g, rbox(0.14, 0.09, 0.42, 0.04), trim, sx * (bedW / 2 + 0.72), 0.62 + 0.09, -bedL + 0.36);
    const nl = part(g, sphere(0.05, 10, 8), glow(sx < 0 ? 0xff5a6a : 0x43e07f, 2.6), sx * (bedW / 2 + 0.8), 0.74, -bedL + 0.62, 0, 0, 0, { shadow: false });
    nl.userData.live = true;
    navLights.push(nl);
  }

  // Patas de aterrizaje.
  const legs = new THREE.Group();
  legs.userData.live = true;
  const legPos = [[-1, cabL * 0.55], [1, cabL * 0.55], [-1, -bedL + 0.3], [1, -bedL + 0.3]];
  for (const [sx, z] of legPos) {
    const x = sx * (Math.max(bedW, cabW) / 2 - 0.15);
    part(legs, cyl(0.04, 0.04, 0.42, 8), steel, x, 0.21, z, 0, 0, sx * 0.25);
    part(legs, cyl(0.13, 0.15, 0.05, 16), dark, x + sx * 0.06, 0.02, z);
  }
  g.add(legs);

  bake(g);

  // Lugares para los contenedores (de adelante hacia atrás, fila por fila).
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push(new THREE.Vector3((c - (cols - 1) / 2) * SLOT.x, 0.64 + CONTAINER.h / 2, -0.32 - SLOT.z / 2 - r * SLOT.z));
    }
  }
  const cargo = new THREE.Group();
  cargo.userData.live = true;
  g.add(cargo);
  g.userData = { ...g.userData, slots, flames, cargo, legs, navLights, model, dims: L };
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
  const blue = mat(C.blue, { rough: 0.45 });
  const orange = mat(C.orange, { rough: 0.5 });
  const deck = mat(0xc5cde6, { rough: 0.6, metal: 0.2 });
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
  part(g, rbox(W + 0.1, 0.06, D + 0.1, 0.03), mat(0xd7ddef, { rough: 0.7 }), 0, 0.03, 0);
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
