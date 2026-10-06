// Miniaturas de los modelos 3D para la interfaz (naves, planetas): se dibujan una sola vez con un
// renderer chico y quedan como imágenes PNG.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeShip, setShipCargo, shipDims } from './models.js';

const cache = new Map();
let r = null;
let env = null;

function renderer() {
  if (r) return r;
  r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.toneMapping = THREE.NeutralToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  return r;
}

function shoot(object, { w = 240, h = 160, view = 6, az = 0.8, el = 0.5, target = new THREE.Vector3() } = {}) {
  const rr = renderer();
  rr.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c4ea, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  scene.add(object);
  const aspect = w / h;
  const cam = new THREE.OrthographicCamera((-view * aspect) / 2, (view * aspect) / 2, view / 2, -view / 2, 0.1, 200);
  cam.position.set(target.x + Math.sin(az) * Math.cos(el) * 50, target.y + Math.sin(el) * 50, target.z + Math.cos(az) * Math.cos(el) * 50);
  cam.lookAt(target);
  rr.setClearColor(0x000000, 0);
  rr.render(scene, cam);
  const url = rr.domElement.toDataURL('image/png');
  scene.remove(object);
  return url;
}

/** Imagen de una nave (con carga de muestra para que se lea qué es). */
export function shipThumb(model, cargo = 'agua') {
  const key = `ship:${model}:${cargo}`;
  if (!cache.has(key)) {
    const ship = makeShip(model);
    setShipCargo(ship, cargo, ship.userData.slots.length);
    const d = shipDims(model);
    const center = new THREE.Vector3(0, 0.9, (d.cabL - d.bedL - 0.9) / 2);
    cache.set(key, shoot(ship, { view: Math.max(4.4, d.length * 0.62), target: center, az: 0.95, el: 0.42 }));
  }
  return cache.get(key);
}

/** Imagen de cualquier objeto (planetas del mapa). */
export function objectThumb(key, make, opts) {
  if (!cache.has(key)) cache.set(key, shoot(make(), opts));
  return cache.get(key);
}
