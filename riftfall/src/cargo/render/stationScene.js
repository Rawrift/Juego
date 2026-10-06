// La estación "Nodo Rift" vista de cerca: la plataforma con el depósito y sus muelles, las
// estanterías del stock, los lugares de estacionamiento, la torre de control, los paneles solares
// y las nubes del planeta abajo. Esta parte es fija; lo que se mueve lo maneja station.js.

import * as THREE from 'three';
import { C, hex } from './palette.js';
import { deckTexture, padTexture, parkTexture, ghostTexture, stripeTexture, wallTexture, solarTexture, signTexture, logoTexture, roundRect } from './textures.js';
import { rbox, cyl, sphere, lathe, mat, glass, glow, part, bake, cached, roundedRectShape } from './kit.js';
import { makeRack, RACK } from './models.js';
import { drawIcon } from './icons2d.js';

export const DECK = { w: 56, d: 32 };
export const BUILDING = { x0: -4.5, x1: 25.5, z0: -15.6, z1: -9.6, h: 4.6 };
export const DOCK_X = [0, 7, 14, 21];
export const PAD = { w: 5.8, l: 11, z0: -9.3 };
export const PARK = { x0: -24.6, step: 5.4, count: 8, z: 9.4, w: 4.9, l: 9.4 };
export const YARD = { cols: 3, rows: 3, x: [-12.7, -18.4, -24.1], z: [-13.4, -9.1, -4.8] };
export const DRONE_PADS = { x0: -25.6, step: 1.75, count: 8, z: 1.5 };
export const TOWER = { x: -7.6, z: -12.6 };

/** Centro de un muelle (plataforma frente al portón). */
export const dockCenter = (i) => new THREE.Vector3(DOCK_X[i], 0, PAD.z0 + PAD.l / 2);
/** Orden en que se usan los lugares del hangar: primero los más cercanos a los muelles. */
export const PARK_ORDER = [4, 5, 3, 6, 2, 7, 1, 0];
export const parkCenter = (i) => new THREE.Vector3(PARK.x0 + PARK_ORDER[i % PARK.count] * PARK.step, 0, PARK.z);
export const dronePad = (i) => new THREE.Vector3(DRONE_PADS.x0 + i * DRONE_PADS.step, 0, DRONE_PADS.z);
/** Posición de cada módulo de estantería (se habilitan de a uno con la capacidad del depósito). */
export const rackSpot = (i) => new THREE.Vector3(YARD.x[i % YARD.cols], 0, YARD.z[YARD.rows - 1 - Math.floor(i / YARD.cols)]);

function paintDeck(g, px, ppu) {
  const rect = (x0, z0, x1, z1) => {
    const [a, b] = px(x0, z0);
    const [c, d] = px(x1, z1);
    return [a, b, c - a, d - b];
  };
  // Calle principal frente a los muelles con línea central amarilla.
  g.fillStyle = 'rgba(120,138,200,0.10)';
  g.fillRect(...rect(-27.5, 1.2 + 1.3, 27.5, 4.4));
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 4;
  for (const z of [2.5, 4.4]) {
    g.beginPath();
    g.moveTo(...px(-27.5, z));
    g.lineTo(...px(27.5, z));
    g.stroke();
  }
  g.strokeStyle = '#f2b92f';
  g.lineWidth = 5;
  g.setLineDash([1.2 * ppu, 0.9 * ppu]);
  g.beginPath();
  g.moveTo(...px(-27, 3.45));
  g.lineTo(...px(27, 3.45));
  g.stroke();
  g.setLineDash([]);
  // Patio de estanterías: piso apenas más oscuro y bordes punteados.
  g.fillStyle = 'rgba(120,138,200,0.08)';
  g.fillRect(...rect(-27, -15.4, -9.8, -2.9));
  g.strokeStyle = 'rgba(242,185,47,0.85)';
  g.lineWidth = 4;
  g.setLineDash([0.5 * ppu, 0.35 * ppu]);
  g.strokeRect(...rect(-27, -15.4, -9.8, -2.9));
  g.setLineDash([]);
  // Plataformas de carga de los drones.
  for (let i = 0; i < DRONE_PADS.count; i++) {
    const p = dronePad(i);
    const [x, y, w, h] = rect(p.x - 0.7, p.z - 0.7, p.x + 0.7, p.z + 0.7);
    g.fillStyle = 'rgba(246,181,42,0.16)';
    roundRect(g, x, y, w, h, 0.25 * ppu);
    g.fill();
    g.strokeStyle = 'rgba(246,181,42,0.9)';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(217,150,26,0.9)';
    drawIcon(g, 'zap', ...px(p.x, p.z), 0.8 * ppu, 2);
  }
  // Senda peatonal hacia la torre.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 6; i++) g.fillRect(...rect(-9.4 + i * 0.6, -9.2, -9.1 + i * 0.6, -7.4));
  // Flechas de circulación sobre la calle.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const x of [-20, -6, 8, 22]) {
    const [ax, az] = px(x, 3.0);
    g.beginPath();
    g.moveTo(ax - 0.9 * ppu, az - 0.18 * ppu);
    g.lineTo(ax + 0.4 * ppu, az - 0.18 * ppu);
    g.lineTo(ax + 0.4 * ppu, az - 0.42 * ppu);
    g.lineTo(ax + 1.0 * ppu, az);
    g.lineTo(ax + 0.4 * ppu, az + 0.42 * ppu);
    g.lineTo(ax + 0.4 * ppu, az + 0.18 * ppu);
    g.lineTo(ax - 0.9 * ppu, az + 0.18 * ppu);
    g.closePath();
    g.globalAlpha = 0.6;
    g.fill();
    g.globalAlpha = 1;
  }
}

function buildDeck(root) {
  const { w, d } = DECK;
  const shape = roundedRectShape(w, d, 2.4);
  // Cuerpo de la plataforma con bisel.
  const body = cached('deckBody', () => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 4, curveSegments: 10 });
    g.rotateX(Math.PI / 2);
    g.translate(0, -0.27, 0);
    return g;
  });
  part(root, body, mat(C.deckSide, { rough: 0.7 }), 0, 0, 0);
  // Superficie pintada.
  const top = cached('deckTop', () => {
    const g = new THREE.ShapeGeometry(shape, 10);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
    return g;
  });
  const tex = deckTexture(w, d, paintDeck);
  tex.flipY = true;
  const topMesh = part(root, top, mat(0xffffff, { map: tex, rough: 0.82 }), 0, 0.012, 0, 0, 0, 0, { shadow: false });
  topMesh.receiveShadow = true;
  // Casco inferior y propulsores.
  part(root, rbox(w - 7, 2.6, d - 7, 1.0), mat(C.deckDark, { rough: 0.6 }), 0, -2.2, 0);
  part(root, rbox(w - 16, 2.2, d - 14, 0.9), mat(0x9eaad3, { rough: 0.6 }), 0, -4.2, 0);
  for (const [x, z] of [[-20, -9], [20, -9], [-20, 9], [20, 9]]) {
    part(root, cyl(1.2, 1.5, 1.4, 28), mat(C.white, { rough: 0.5 }), x, -3.4, z);
    part(root, cyl(0.9, 1.2, 0.8, 28), mat(C.steel, { rough: 0.4, metal: 0.4 }), x, -4.4, z);
    part(root, cached('thrGlow', () => new THREE.CircleGeometry(0.85, 24).rotateX(Math.PI / 2)), glow(0x9fe3ff, 2), x, -4.82, z, 0, 0, 0, { shadow: false });
  }
  // Borde: baranda baja blanca con una línea de luz celeste.
  const edge = cached('deckEdge', () => {
    const outer = roundedRectShape(w + 0.2, d + 0.2, 2.5);
    outer.holes.push(roundedRectShape(w - 0.5, d - 0.5, 2.1));
    const g = new THREE.ExtrudeGeometry(outer, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    return g;
  });
  part(root, edge, mat(C.white, { rough: 0.5 }), 0, 0.0, 0);
  const strip = cached('deckStrip', () => {
    const outer = roundedRectShape(w + 0.62, d + 0.62, 2.7);
    outer.holes.push(roundedRectShape(w + 0.3, d + 0.3, 2.5));
    const g = new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    return g;
  });
  part(root, strip, glow(C.glow, 1.3), 0, -0.55, 0, 0, 0, 0, { shadow: false });
  // Postes de baranda en el frente.
  const railMat = mat(C.white, { rough: 0.45 });
  for (let x = -26; x <= 26; x += 2) {
    if (Math.abs(x) < 1) continue;
    part(root, cyl(0.05, 0.05, 0.9, 8), railMat, x, 0.6, d / 2 - 0.15);
  }
  part(root, rbox(w - 3, 0.08, 0.1, 0.04), railMat, 0, 1.05, d / 2 - 0.15);
  part(root, rbox(w - 3, 0.06, 0.08, 0.03), railMat, 0, 0.7, d / 2 - 0.15);
}

function buildBuilding(root) {
  const { x0, x1, z0, z1, h } = BUILDING;
  const W = x1 - x0;
  const D = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const wall = mat(C.wall, { rough: 0.6 });
  const blue = mat(C.blue, { rough: 0.42 });
  const navy = mat(C.navy, { rough: 0.5 });
  const roof = mat(C.roof, { rough: 0.55 });

  // Cuerpo con chapa acanalada en el frente.
  part(root, rbox(W, h, D, 0.18), wall, cx, h / 2, cz);
  const tex = wallTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(W / 1.6, 1);
  part(root, rbox(W - 0.2, h - 0.5, 0.06, 0.02), mat(0xffffff, { map: tex, rough: 0.55 }), cx, h / 2 + 0.15, z1 + 0.02);
  // Zócalo y columnas azules.
  part(root, rbox(W + 0.1, 0.42, D + 0.1, 0.12), navy, cx, 0.21, cz);
  for (const x of [x0 + 0.2, x1 - 0.2, ...DOCK_X.slice(0, -1).map((d) => d + 3.5)]) {
    part(root, rbox(0.42, h + 0.15, 0.42, 0.1), blue, x, (h + 0.15) / 2, z1 + 0.12);
  }
  part(root, rbox(W + 0.2, 0.3, 0.36, 0.1), blue, cx, h + 0.02, z1 + 0.1);
  // Portones de los muelles: hueco iluminado, marco azul, burletes y cortina levantada.
  for (let i = 0; i < DOCK_X.length; i++) {
    const x = DOCK_X[i];
    part(root, rbox(3.7, 3.25, 0.4, 0.06), mat(0x33437e, { rough: 0.7, emissive: 0x23336e, ei: 0.25 }), x, 1.73, z1 - 0.05);
    part(root, rbox(3.1, 0.06, 0.3, 0.02), glow(0xe8f1ff, 1.4), x, 3.2, z1 - 0.02);
    // Adentro se ve un poco del depósito: una pila de cajas iluminada.
    part(root, rbox(1.2, 0.8, 0.8, 0.07), mat(0x5a6fb3, { rough: 0.7 }), x - 0.9, 0.82, z1 - 0.32);
    part(root, rbox(1.2, 0.8, 0.8, 0.07), mat(0x4d61a6, { rough: 0.7 }), x - 0.9, 1.64, z1 - 0.32);
    part(root, rbox(1.2, 0.8, 0.8, 0.07), mat(0x5a6fb3, { rough: 0.7 }), x + 0.8, 0.82, z1 - 0.32);
    for (const sx of [-1, 1]) {
      part(root, rbox(0.3, 3.55, 0.4, 0.08), blue, x + sx * 2.0, 1.78, z1 + 0.16);
      part(root, rbox(0.22, 3.2, 0.34, 0.08), navy, x + sx * 1.72, 1.7, z1 + 0.28);
    }
    part(root, rbox(4.3, 0.36, 0.42, 0.09), blue, x, 3.52, z1 + 0.16);
    // Cortina enrollada arriba.
    part(root, cyl(0.22, 0.22, 3.7, 20), mat(0xdbe1f1, { rough: 0.5 }), x, 3.2, z1 + 0.1, 0, 0, Math.PI / 2);
    // Cartel con el número del muelle y luz de estado.
    const sign = part(root, cached('dockSign', () => new THREE.PlaneGeometry(1.0, 0.5)), mat(0xffffff, { map: signTexture(`D${i + 1}`, { w: 192, h: 96, size: 54, radius: 26 }), rough: 0.5 }), x - 1.0, 4.1, z1 + 0.04, 0, 0, 0, { shadow: false });
    sign.receiveShadow = true;
  }
  // Techo: bóvedas redondeadas con claraboyas y canaletas.
  const bays = 4;
  const bw = W / bays;
  const vault = cached(`vault:${bw}:${D}`, () => {
    const g = new THREE.CylinderGeometry(bw / 2, bw / 2, D - 0.2, 40, 1, false, -Math.PI / 2, Math.PI);
    g.rotateX(-Math.PI / 2);
    g.scale(1, 0.38, 1);
    return g;
  });
  for (let i = 0; i < bays; i++) {
    const vx = x0 + bw * (i + 0.5);
    part(root, vault, roof, vx, h, cz);
    part(root, rbox(1.3, 0.12, D - 1.6, 0.05), mat(0xe6eeff, { rough: 0.15, metal: 0.1, emissive: 0xcfdcff, ei: 0.25, env: 1.5 }), vx, h + bw / 2 * 0.38 + 0.02, cz);
    if (i > 0) part(root, rbox(0.3, 0.3, D, 0.08), mat(C.roofDark, { rough: 0.5 }), x0 + bw * i, h + 0.1, cz);
  }
  // Equipos en el techo.
  for (const [x, z] of [[x0 + 3.6, cz - 1.4], [x1 - 4.2, cz + 1.2]]) {
    part(root, rbox(1.4, 0.7, 1.0, 0.12), mat(C.white, { rough: 0.5 }), x, h + 1.25, z);
    part(root, cyl(0.32, 0.32, 0.06, 20), mat(C.steel, { rough: 0.5 }), x, h + 1.62, z);
  }
  // Cartel con el logo sobre el techo.
  const logo = part(root, cached('roofLogo', () => new THREE.PlaneGeometry(9, 2.25)), mat(0xffffff, { map: logoTexture(), transparent: true, rough: 0.5 }), x0 + 6.4, h + 2.75, cz + 1.2, 0, 0, 0, { shadow: false });
  logo.userData.treatAsOpaque = true;
  part(root, rbox(8.6, 0.12, 0.12, 0.05), mat(C.steel, { rough: 0.5 }), x0 + 6.4, h + 1.6, cz + 1.12);
  for (const sx of [-1, 1]) part(root, rbox(0.12, 1.9, 0.12, 0.04), mat(C.steel, { rough: 0.5 }), x0 + 6.4 + sx * 3.8, h + 0.95, cz + 1.12);
}

function buildPads(root, docks) {
  const pads = [];
  for (let i = 0; i < DOCK_X.length; i++) {
    const c = dockCenter(i);
    const locked = i >= docks;
    const geo = cached('padGeo', () => {
      const g = new THREE.PlaneGeometry(PAD.w, PAD.l);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const m = part(root, geo, mat(0xffffff, { map: padTexture(`D${i + 1}`, { locked }), transparent: locked, rough: 0.75 }), c.x, 0.03, c.z, 0, 0, 0, { shadow: false });
    m.receiveShadow = true;
    if (!locked) {
      // Luces en las esquinas de la plataforma.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const l = part(root, rbox(0.22, 0.08, 0.22, 0.04), glow(C.glow, 1.8), c.x + sx * (PAD.w / 2 - 0.35), 0.07, c.z + sz * (PAD.l / 2 - 0.35), 0, 0, 0, { shadow: false });
        l.userData.live = true;
      }
    }
    pads.push(m);
  }
  return pads;
}

/** Lugares del hangar como placas separadas: se ven habilitados o "por comprar". */
function buildParking(root) {
  const geo = cached('parkGeo', () => new THREE.PlaneGeometry(PARK.w, PARK.l).rotateX(-Math.PI / 2));
  const spots = [];
  for (let i = 0; i < PARK.count; i++) {
    const c = parkCenter(i);
    const m = part(root, geo, mat(0xffffff, { map: parkTexture(`H${i + 1}`, false), transparent: true, rough: 0.8 }), c.x, 0.02, c.z, 0, 0, 0, { shadow: false });
    m.receiveShadow = true;
    spots.push(m);
  }
  return spots;
}

/** Contorno punteado donde se puede construir más (estanterías por comprar). */
function buildGhosts(root) {
  const ghosts = [];
  for (let i = 0; i < YARD.cols * YARD.rows; i++) {
    const c = rackSpot(i);
    const m = part(root, cached('ghostGeo', () => new THREE.PlaneGeometry(4.5, 2.4).rotateX(-Math.PI / 2)), mat(0xffffff, { map: ghostTexture(), transparent: true, rough: 0.8 }), c.x, 0.025, c.z, 0, 0, 0, { shadow: false });
    ghosts.push(m);
  }
  return ghosts;
}

/** Obra en construcción sobre un muelle bloqueado: conos y una valla a rayas. */
function buildWorks(root) {
  const works = [];
  const cone = lathe('cone', [[0.001, 0.62], [0.08, 0.6], [0.2, 0.12], [0.32, 0.06], [0.32, 0], [0.001, 0]], 24);
  const orange = mat(0xff8a3d, { rough: 0.5 });
  const white = mat(C.white, { rough: 0.5 });
  const stripe = mat(0xffffff, { map: stripeTexture(), rough: 0.5 });
  for (let i = 0; i < DOCK_X.length; i++) {
    const g = new THREE.Group();
    const c = dockCenter(i);
    g.position.set(c.x, 0, c.z);
    for (const [x, z] of [[-1.9, 4.3], [1.9, 4.3], [-1.9, 1.5], [1.9, -1.5]]) {
      part(g, cone, orange, x, 0, z);
      part(g, cyl(0.17, 0.2, 0.1, 20), white, x, 0.33, z);
    }
    part(g, rbox(3.2, 0.36, 0.12, 0.05), stripe, 0, 0.75, 4.5);
    for (const sx of [-1, 1]) {
      part(g, rbox(0.12, 0.95, 0.12, 0.04), white, sx * 1.5, 0.47, 4.5);
      part(g, rbox(0.5, 0.08, 0.5, 0.04), mat(C.steel, { rough: 0.5 }), sx * 1.5, 0.04, 4.5);
    }
    // Cartel "próximamente" con el número de muelle.
    part(g, cached('worksSign', () => new THREE.PlaneGeometry(1.6, 0.8)), mat(0xffffff, { map: signTexture(`D${i + 1}`, { bg: '#f6b52a', fg: '#1d2a55', w: 192, h: 96, size: 52, radius: 20 }), rough: 0.5 }), 0, 1.45, 4.56, 0, 0, 0, { shadow: false });
    part(g, rbox(0.08, 1.0, 0.08, 0.03), white, 0, 0.6, 4.48);
    bake(g);
    root.add(g);
    works.push(g);
  }
  return works;
}

/** Árbol de juguete en una maceta (como en las maquetas). */
function makeTree(scale = 1) {
  const g = new THREE.Group();
  part(g, rbox(1.9, 0.55, 1.9, 0.2), mat(C.white, { rough: 0.5 }), 0, 0.28, 0);
  part(g, rbox(1.6, 0.06, 1.6, 0.05), mat(0x6f8f62, { rough: 0.9 }), 0, 0.56, 0);
  part(g, cyl(0.09, 0.13, 1.3, 10), mat(0x9a7a5c, { rough: 0.8 }), 0, 1.15, 0);
  const leaf = mat(0x5ccf8f, { rough: 0.65 });
  const leaf2 = mat(0x48b97c, { rough: 0.65 });
  part(g, sphere(0.85, 28, 20), leaf, 0, 2.25, 0);
  part(g, sphere(0.6, 24, 16), leaf2, 0.45, 1.85, 0.25);
  part(g, sphere(0.55, 24, 16), leaf, -0.4, 1.95, -0.2);
  part(g, sphere(0.5, 24, 16), leaf2, 0.05, 2.75, 0.1);
  bake(g);
  g.scale.setScalar(scale);
  return g;
}

function makeLamp() {
  const g = new THREE.Group();
  part(g, cyl(0.07, 0.09, 3.2, 10), mat(C.white, { rough: 0.45 }), 0, 1.6, 0);
  part(g, rbox(0.9, 0.12, 0.3, 0.06), mat(C.white, { rough: 0.45 }), 0.3, 3.2, 0);
  part(g, rbox(0.6, 0.04, 0.2, 0.02), glow(0xfff6dc, 1.4), 0.4, 3.13, 0, 0, 0, 0, { shadow: false });
  part(g, cyl(0.22, 0.26, 0.12, 16), mat(C.steel, { rough: 0.5 }), 0, 0.06, 0);
  bake(g);
  return g;
}

function buildDecor(root) {
  for (const [x, z, sc] of [[-26, 13.6, 1], [-6.4, -7.6, 0.85], [25.6, 1.8, 1], [-26.4, -0.4, 0.8], [16.2, 14.2, 0.9]]) {
    const t = makeTree(sc);
    t.position.set(x, 0, z);
    root.add(t);
  }
  for (const x of [-20, -8, 4, 16]) {
    const l = makeLamp();
    l.position.set(x, 0, 5.05);
    l.rotation.y = -Math.PI / 2;
    root.add(l);
  }
}

function buildTower(root) {
  const g = new THREE.Group();
  g.position.set(TOWER.x, 0, TOWER.z);
  const white = mat(C.white, { rough: 0.45 });
  const blue = mat(C.blue, { rough: 0.42 });
  part(g, lathe('towerBase', [[0.001, 0], [1.7, 0], [1.75, 0.15], [1.45, 0.6], [1.0, 0.75], [0.001, 0.76]], 40), mat(C.offWhite, { rough: 0.55 }), 0, 0, 0);
  part(g, cyl(0.78, 0.92, 6.2, 36), white, 0, 3.8, 0);
  part(g, cyl(0.84, 0.84, 0.45, 36), blue, 0, 3.6, 0);
  for (let i = 0; i < 4; i++) part(g, rbox(0.32, 0.5, 0.06, 0.03), glass(), Math.sin(i * 1.57 + 0.78) * 0.86, 2.3 + i * 0.55, Math.cos(i * 1.57 + 0.78) * 0.86, 0, i * 1.57 + 0.78, 0);
  // Cabina de control con ventanales inclinados.
  part(g, lathe('towerCab', [[0.001, 0], [1.25, 0], [1.6, 0.35], [1.62, 0.42], [0.001, 0.42]], 40), white, 0, 6.85, 0);
  part(g, lathe('towerGlass', [[1.38, 0], [1.72, 1.15], [1.7, 1.2], [1.36, 0.05]], 40), glass(), 0, 7.27, 0);
  part(g, lathe('towerRoof', [[1.86, 0], [1.88, 0.12], [1.4, 0.45], [0.6, 0.62], [0.001, 0.64]], 40), white, 0, 8.45, 0);
  part(g, cyl(0.06, 0.08, 2.4, 8), mat(C.steel, { rough: 0.4, metal: 0.4 }), 0.3, 10.1, 0.2);
  const beacon = part(g, sphere(0.13, 12, 10), glow(0xff4d5e, 3), 0.3, 11.35, 0.2, 0, 0, 0, { shadow: false });
  beacon.userData.live = true;
  // Radar en un brazo lateral.
  const radar = new THREE.Group();
  radar.position.set(-0.9, 9.4, -0.2);
  radar.userData.live = true;
  part(radar, cyl(0.06, 0.06, 0.5, 8), mat(C.steel, { rough: 0.5 }), 0, -0.2, 0);
  const dish = part(radar, lathe('dish', [[0.001, 0], [0.4, 0.06], [0.72, 0.22], [0.74, 0.25], [0.001, 0.05]], 28), white, 0, 0.1, 0, Math.PI / 2.4, 0, 0);
  dish.userData.live = true;
  g.add(radar);
  bake(g);
  root.add(g);
  return { beacon, radar };
}

function buildSolarWings(root) {
  const truss = mat(0xb8c1dc, { rough: 0.45, metal: 0.4 });
  const panel = mat(0xffffff, { map: solarTexture(), rough: 0.28, metal: 0.25, env: 1.3 });
  const frame = mat(C.white, { rough: 0.5 });
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const x0 = side * (DECK.w / 2 + 0.2);
    const len = 17;
    g.position.set(x0, 0.3, -4);
    part(g, rbox(len, 0.4, 0.4, 0.1), truss, side * len / 2, 0, 0);
    part(g, rbox(1.4, 1.0, 1.4, 0.25), frame, side * 0.5, 0, 0);
    for (let i = 0; i < 4; i++) {
      const px = side * (2.6 + i * 3.9);
      part(g, rbox(0.18, 0.18, 7.2, 0.06), truss, px, 0, 0);
      for (const sz of [-1, 1]) {
        const p = new THREE.Group();
        p.position.set(px, 0.12, sz * 2.05);
        p.rotation.x = sz * -0.16;
        part(p, rbox(3.6, 0.07, 3.2, 0.04), frame, 0, -0.04, 0);
        part(p, rbox(3.45, 0.06, 3.05, 0.02), panel, 0, 0.01, 0);
        g.add(p);
      }
    }
    bake(g);
    root.add(g);
  }
}

function buildTanks(root) {
  const g = new THREE.Group();
  g.position.set(21.6, 0, 9.6);
  const white = mat(C.white, { rough: 0.45 });
  const orange = mat(C.orange, { rough: 0.45 });
  const steel = mat(C.steel, { rough: 0.45, metal: 0.4 });
  const tank = cached('tank', () => new THREE.CapsuleGeometry(0.9, 4.2, 10, 28).rotateZ(Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const z = -3 + i * 2.25;
    part(g, tank, white, 0, 1.25, z);
    for (const x of [-1.4, 1.4]) part(g, cyl(0.93, 0.93, 0.18, 28), orange, x, 1.25, z, 0, 0, Math.PI / 2);
    for (const x of [-1.7, 1.7]) part(g, rbox(0.4, 0.5, 1.5, 0.08), steel, x, 0.25, z);
  }
  part(g, rbox(0.14, 0.14, 6.2, 0.05), steel, 2.9, 0.5, -0.75);
  part(g, cyl(0.07, 0.07, 1.2, 10), steel, 2.9, 1.0, 2.2);
  // Plato de comunicaciones.
  const dish = new THREE.Group();
  dish.position.set(0.2, 0, 4.3);
  part(dish, cyl(0.35, 0.5, 0.5, 20), mat(C.offWhite, { rough: 0.5 }), 0, 0.25, 0);
  part(dish, cyl(0.12, 0.12, 1.4, 10), steel, 0, 1.0, 0);
  part(dish, lathe('commDish', [[0.001, 0], [0.6, 0.08], [1.15, 0.36], [1.18, 0.4], [0.001, 0.08]], 32), white, 0, 1.75, 0, -0.7, 0.6, 0);
  g.add(dish);
  bake(g);
  root.add(g);
}

/** Nubes del planeta, muy abajo de la estación: claras y suaves para que la estación resalte. */
function buildClouds(root) {
  const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSky: { value: new THREE.Color(0xcfd9f4) }, uCloud: { value: new THREE.Color(0xf7f9ff) }, uShade: { value: new THREE.Color(0xbfcaec) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSky; uniform vec3 uCloud; uniform vec3 uShade; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<6;i++){ v += a*n(p); p = p*2.03 + vec2(1.7,9.2); a *= 0.5; } return v; }
      void main(){
        vec2 p = vW.xz * 0.028 + vec2(uTime * 0.01, uTime * 0.004);
        vec2 q = vec2(fbm(p * 0.5), fbm(p * 0.5 + vec2(5.2, 1.3)));
        float c = fbm(p + q * 1.6);
        // Sombra falsa: densidad un poco más adelante en la dirección de la luz.
        float c2 = fbm(p + q * 1.6 + vec2(0.06, 0.05));
        float cover = smoothstep(0.46, 0.66, c);
        vec3 col = mix(uSky, uCloud, cover);
        col = mix(col, uShade, clamp((c2 - c) * 6.0, 0.0, 1.0) * cover * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = -90;
  mesh.userData.cannotReceiveAO = false;
  root.add(mesh);
  return m;
}

export function buildStationScene({ docks = 1, shadow = 4096 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd6dff6);
  const root = new THREE.Group();
  scene.add(root);

  // Luz: cielo/suelo suave + sol con sombras suaves + relleno frío.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c4ea, 1.55));
  const sun = new THREE.DirectionalLight(0xfff8ef, 2.6);
  sun.position.set(-26, 52, 30);
  sun.castShadow = true;
  const s = sun.shadow;
  s.mapSize.set(shadow, shadow);
  s.camera.left = -48; s.camera.right = 48; s.camera.top = 40; s.camera.bottom = -40;
  s.camera.near = 1; s.camera.far = 160;
  s.bias = -0.0004;
  s.normalBias = 0.03;
  s.radius = 5;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xdfe7ff, 0.6);
  fill.position.set(30, 20, -10);
  scene.add(fill);

  buildDeck(root);
  buildBuilding(root);
  const tower = buildTower(root);
  buildSolarWings(root);
  buildTanks(root);
  const pads = buildPads(root, docks);
  const parking = buildParking(root);
  const ghosts = buildGhosts(root);
  const works = buildWorks(root);
  buildDecor(root);
  const clouds = buildClouds(scene);

  // Estanterías (todas construidas; station.js muestra las que correspondan a la capacidad).
  const racks = [];
  for (let i = 0; i < YARD.cols * YARD.rows; i++) {
    const r = makeRack();
    r.position.copy(rackSpot(i));
    root.add(r);
    racks.push(r);
  }

  return { scene, root, sun, tower, pads, parking, ghosts, works, racks, clouds, rackSlots: RACK.cols * RACK.deep * RACK.levels };
}
