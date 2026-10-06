// Piezas básicas para armar los modelos: geometrías redondeadas en caché, materiales compartidos y
// una función que junta las partes fijas de un modelo por material (menos llamadas de dibujo).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const geos = new Map();
const mats = new Map();

/** Caja con bordes redondeados (todas las cajas del juego lo son: es lo que da el aspecto "juguete"). */
export function rbox(w, h, d, r = 0.06, seg = 3) {
  const key = `rb:${w}:${h}:${d}:${r}:${seg}`;
  if (!geos.has(key)) geos.set(key, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
  return geos.get(key);
}

export function cyl(rt, rb, h, seg = 24) {
  const key = `cy:${rt}:${rb}:${h}:${seg}`;
  if (!geos.has(key)) geos.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geos.get(key);
}

export function sphere(r, ws = 24, hs = 16) {
  const key = `sp:${r}:${ws}:${hs}`;
  if (!geos.has(key)) geos.set(key, new THREE.SphereGeometry(r, ws, hs));
  return geos.get(key);
}

/** Torno: perfil [[radio, altura], ...] girado alrededor del eje Y. */
export function lathe(key, points, seg = 32) {
  const k = `la:${key}:${seg}`;
  if (!geos.has(k)) geos.set(k, new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  return geos.get(k);
}

export function cached(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}

/** Material estándar compartido. Mate por defecto, como plástico pintado. */
export function mat(color, opts = {}) {
  const { rough = 0.62, metal = 0.0, emissive = 0x000000, ei = 1, map = null, transparent = false, opacity = 1, side = THREE.FrontSide, env = 1, flat = false } = opts;
  const key = `m:${color}:${rough}:${metal}:${emissive}:${ei}:${map?.uuid}:${transparent}:${opacity}:${side}:${env}:${flat}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei, map,
      transparent, opacity, side, envMapIntensity: env, flatShading: flat
    }));
  }
  return mats.get(key);
}

/** Vidrio oscuro con reflejo del entorno. */
export const glass = () => mat(0x18223f, { rough: 0.12, metal: 0.35, env: 1.4 });
/** Luz que brilla (no le afecta la iluminación). */
export function glow(color, ei = 1.6) {
  return mat(color, { emissive: color, ei, rough: 0.4 });
}

/** Crea una malla con sombra y la ubica. */
export function part(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, { shadow = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = shadow;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

/**
 * Junta las mallas fijas de `group` (las que no tienen userData.live) en una malla por material.
 * Los hijos que se mueven solos (rotores, llamas, luces que titilan) se marcan con userData.live.
 */
export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.live || o.isInstancedMesh) return;
    let p = o.parent;
    while (p && p !== group) {
      if (p.userData.live) return;
      p = p.parent;
    }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], shadow: false, receive: false });
    const b = buckets.get(key);
    b.geos.push(g);
    b.shadow ||= o.castShadow;
    b.receive ||= o.receiveShadow;
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.shadow;
    m.receiveShadow = b.receive;
    group.add(m);
  }
  return group;
}

/** Perfil 2D extruido de canto, con bisel suave. `pts` en el plano (z, y); el espesor va en X. */
export function profile(key, pts, width, bevel = 0.07) {
  return cached(`pr:${key}:${width}:${bevel}`, () => {
    const shape = new THREE.Shape();
    pts.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    shape.closePath();
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
    g.rotateY(-Math.PI / 2);
    g.translate(depth / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  });
}

/** Rectángulo redondeado como forma 2D. */
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
