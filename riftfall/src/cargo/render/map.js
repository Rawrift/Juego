// Mapa del universo: los sistemas estelares (Rift, Umbra y Helios) con su estrella, sus planetas en
// órbita y su portal de salto; el cinturón de asteroides, la estación y las naves viajando con su
// ruta (o saltando entre portales). Estilo de maqueta sobre una mesa, con nebulosas de fondo.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { makePlanet, makeSun } from './planets.js';
import { makeShip, shipStyle, shipStyleKey, setShipCargo, setThrust, makePin, userUpdates } from './models.js';
import { rbox, mat, part, bake } from './kit.js';
import { C, CARGO_COLORS } from './palette.js';
import { solarTexture } from './textures.js';
import { icon } from '../icons.js';
import { t, money, dur, num } from '../i18n.js';
import { PORTS, PORT_IDS, GATE_IDS, BELT, SHIPS, SYSTEMS, SYSTEM_IDS, JUMP, sysOf } from '../sim/data.js';
import { position, dist, intercept } from '../sim/orbit.js';
import { buyPrice, priceTrend, value } from '../sim/sim.js';

const SHIP_SCALE = 1.05;
const SHIP_Y = 2.2;
/** En el mapa los planetas se dibujan más grandes que su tamaño "real" para que se lean bien. */
const vis = (id) => PORTS[id].radius * (PORTS[id].radius > 5 ? 1.55 : 2.2);
/** Tamaño de cada sistema en el mapa y el color de su nebulosa. */
const SYS_LOOK = {
  rift: { r: 128, nebula: ['40,30,110', '18,16,60'], dots: 'rgba(77,232,255,0.13)', light: 0xfff0dc, sun: 6.5, reach: 190 },
  umbra: { r: 92, nebula: ['110,26,48', '50,12,40'], dots: 'rgba(255,110,90,0.13)', light: 0xffb09a, sun: 5.2, reach: 150 },
  helios: { r: 98, nebula: ['20,70,130', '10,30,80'], dots: 'rgba(140,200,255,0.14)', light: 0xd8ecff, sun: 7.4, reach: 150 }
};
const GATE_COLOR = { rift: 0x4de8ff, umbra: 0xff6a5a, helios: 0x8fc8ff };

function circlePoints(r, n = 256, cx = 0, cz = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
  }
  return pts;
}

/** Portal de salto: anillo grande con su remolino encendido y cuatro anclajes. */
function makeGate(color) {
  const g = new THREE.Group();
  const frame = mat(0x3a4378, { rough: 0.45, metal: 0.5 });
  part(g, new THREE.TorusGeometry(2.4, 0.32, 14, 48), frame, 0, 0, 0);
  part(g, new THREE.TorusGeometry(2.4, 0.12, 10, 48), mat(color, { emissive: color, ei: 2.4 }), 0, 0, 0.18, 0, 0, 0, { shadow: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    part(g, rbox(0.7, 0.7, 0.9, 0.12), frame, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0, 0, 0, a);
  }
  const swirl = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float s = sin(a * 3.0 + r * 9.0 - uTime * 2.4) * 0.5 + 0.5;
        float k = smoothstep(1.0, 0.2, r) * (0.35 + 0.65 * s);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), (1.0 - r) * 0.6) * k, k);
      }`
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 48), swirl);
  disc.userData.cannotReceiveAO = true;
  g.add(disc);
  g.userData.swirl = swirl;
  return g;
}

/** Nebulosa de fondo (un brillo grande y suave debajo de cada sistema). */
function nebula(rgb, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, `rgba(${rgb[0]},0.55)`);
  grd.addColorStop(0.5, `rgba(${rgb[1]},0.25)`);
  grd.addColorStop(1, `rgba(${rgb[1]},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.userData.cannotReceiveAO = true;
  return m;
}

function fatLine(points, { color = 0x9aa8d8, width = 1.5, dashed = false, dash = 2, gap = 1.5, opacity = 1 } = {}) {
  const geo = new LineGeometry();
  geo.setPositions(points);
  const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: dash, gapSize: gap, transparent: opacity < 1, opacity, worldUnits: false });
  const line = new Line2(geo, m);
  line.computeLineDistances();
  line.userData.cannotReceiveAO = true;
  return line;
}

/** La estación en miniatura para el mapa. */
function miniStation() {
  const g = new THREE.Group();
  part(g, rbox(3.4, 0.35, 2.2, 0.15), mat(C.deck, { rough: 0.7 }), 0, 0, 0);
  part(g, rbox(2.0, 0.7, 0.7, 0.12), mat(C.wall, { rough: 0.6 }), 0.5, 0.5, -0.6);
  part(g, rbox(2.1, 0.2, 0.78, 0.08), mat(C.roof, { rough: 0.6 }), 0.5, 0.92, -0.6);
  part(g, rbox(0.3, 1.4, 0.3, 0.12), mat(C.white, { rough: 0.5 }), -1.1, 0.8, -0.6);
  part(g, rbox(0.4, 0.2, 0.4, 0.1), mat(C.glass, { rough: 0.2 }), -1.1, 1.55, -0.6);
  for (const sx of [-1, 1]) {
    part(g, rbox(2.2, 0.08, 0.1, 0.03), mat(C.steelLight, { rough: 0.5 }), sx * 2.6, 0.05, 0);
    part(g, rbox(1.6, 0.06, 1.3, 0.04), mat(0xffffff, { map: solarTexture(), rough: 0.3, metal: 0.2 }), sx * 2.9, 0.08, 0);
  }
  part(g, rbox(3.5, 0.06, 0.08, 0.03), mat(C.blue, { rough: 0.4 }), 0, 0.2, 1.1);
  bake(g);
  return g;
}

export function createMap(stage, state, { onMarket } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050e);

  scene.add(new THREE.HemisphereLight(0x8fa0ff, 0x1a1238, 0.55));
  // Cada estrella ilumina solo su sistema (la luz se apaga antes de llegar a los otros).
  for (const id of SYSTEM_IDS) {
    const L = SYS_LOOK[id];
    const light = new THREE.PointLight(L.light, 2.8, L.reach, 0);
    light.position.set(SYSTEMS[id].x, 0, SYSTEMS[id].z);
    scene.add(light);
  }
  const top = new THREE.DirectionalLight(0x9fb0ff, 0.35);
  top.position.set(-30, 120, 40);
  top.castShadow = true;
  top.shadow.mapSize.set(2048, 2048);
  Object.assign(top.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 300 });
  top.shadow.radius = 6;
  top.shadow.bias = -0.0005;
  scene.add(top, top.target);

  // Mesa: un disco por sistema con una grilla de puntos, su nebulosa debajo y una sombra suave.
  const floorY = -9;
  for (const id of SYSTEM_IDS) {
    const L = SYS_LOOK[id];
    const { x: cx, z: cz } = SYSTEMS[id];
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(512, 512, 0, 512, 512, 512);
    grd.addColorStop(0, `rgba(${L.nebula[0]},0.55)`);
    grd.addColorStop(0.55, `rgba(${L.nebula[1]},0.45)`);
    grd.addColorStop(1, 'rgba(4,5,14,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = L.dots;
    for (let x = 16; x < 1024; x += 24) for (let y = 16; y < 1024; y += 24) {
      const d = Math.hypot(x - 512, y - 512);
      if (d < 470) g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(L.r, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    floor.position.set(cx, floorY, cz);
    floor.userData.cannotReceiveAO = true;
    scene.add(floor);
    // Sin escribir profundidad: así no corta el brillo de las estrellas.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(L.r - 4, 96).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.25, color: 0x000000, depthWrite: false }));
    shadow.position.set(cx, floorY + 0.05, cz);
    shadow.receiveShadow = true;
    shadow.userData.treatAsOpaque = true;
    scene.add(shadow);
    const neb = nebula(L.nebula, L.r * 3.2);
    neb.position.set(cx, floorY - 30, cz);
    scene.add(neb);
  }

  // Estrellas de fondo (puntos fijos muy lejos) y una nebulosa suave de la grieta.
  {
    const n = 4200;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const tint = [[1, 1, 1], [0.6, 0.9, 1], [1, 0.6, 0.9], [0.8, 0.7, 1]];
    for (let i = 0; i < n; i++) {
      pos.set([120 + (rnd() - 0.5) * 1500, -60 - rnd() * 220, 90 + (rnd() - 0.5) * 1500], i * 3);
      const t = tint[i % tint.length];
      const b = 0.4 + rnd() * 0.6;
      col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    stars.userData.cannotReceiveAO = true;
    scene.add(stars);
  }

  // Órbitas (alrededor de la estrella de cada sistema).
  const orbitLines = {};
  for (const id of Object.keys(PORTS)) {
    const isHq = id === 'hq';
    const gate = PORTS[id].kind === 'gate';
    const c = SYSTEMS[sysOf(id)];
    const line = fatLine(circlePoints(PORTS[id].orbit, 256, c.x, c.z), {
      color: isHq ? C.blue : gate ? GATE_COLOR[sysOf(id)] : 0x7b6cff, width: isHq ? 2 : 1.4, dashed: true,
      dash: isHq ? 2.4 : 1.2, gap: isHq ? 1.6 : gate ? 2.6 : 1.4, opacity: isHq ? 0.9 : gate ? 0.4 : 0.55
    });
    scene.add(line);
    orbitLines[id] = line;
  }

  // Cinturón de asteroides: rocas suaves, cada una con su tamaño y giro.
  const rockGeo = new THREE.IcosahedronGeometry(1, 3);
  {
    const p = rockGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.22 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3 - v.x) + 0.1 * Math.sin(v.y * 7 + v.z * 5);
      v.multiplyScalar(k);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    rockGeo.computeVertexNormals();
  }
  const ROCKS = 520;
  const belt = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), ROCKS);
  belt.castShadow = true;
  {
    let s = 99;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tones = [0x8a7f9c, 0x6f6a8f, 0x9a8da8, 0x5f5a7e, 0x857a96];
    for (let i = 0; i < ROCKS; i++) {
      const a = rnd() * Math.PI * 2;
      const r = BELT.inner + 0.6 + rnd() * (BELT.outer - BELT.inner - 1.2);
      const sc = 0.18 + Math.pow(rnd(), 3) * 0.75;
      q.setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6));
      m.compose(new THREE.Vector3(Math.cos(a) * r, (rnd() - 0.5) * 1.6, Math.sin(a) * r), q, new THREE.Vector3(sc, sc * (0.7 + rnd() * 0.4), sc));
      belt.setMatrixAt(i, m);
      belt.setColorAt(i, new THREE.Color(tones[i % tones.length]));
    }
  }
  scene.add(belt);

  // Estrellas de cada sistema.
  const suns = SYSTEM_IDS.map((id) => {
    const sn = makeSun(SYS_LOOK[id].sun, SYSTEMS[id].star);
    sn.position.set(SYSTEMS[id].x, 0, SYSTEMS[id].z);
    scene.add(sn);
    return sn;
  });

  // Portales de salto y las rutas de salto entre ellos.
  const gates = {};
  for (const id of GATE_IDS) {
    const gt = makeGate(GATE_COLOR[sysOf(id)]);
    gt.scale.setScalar(1.6);
    gt.traverse((o) => (o.userData.port = id));
    scene.add(gt);
    gates[id] = gt;
  }
  const lanes = [['portal', 'umbraGate'], ['portal', 'heliosGate'], ['umbraGate', 'heliosGate']].map(([a, b]) => {
    const line = fatLine([0, 0, 0, 1, 0, 0], { color: 0xb38cff, width: 1.6, dashed: true, dash: 3, gap: 4, opacity: 0.5 });
    scene.add(line);
    return { a, b, line };
  });

  // Nombre de cada sistema, con el nivel que pide si todavía no se llega.
  const sysLabels = {};
  for (const id of SYSTEM_IDS) {
    const el = document.createElement('div');
    el.className = 'lbl sys-lbl';
    el.dataset.sys = id;
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 0.5);
    obj.position.set(SYSTEMS[id].x, 0, SYSTEMS[id].z + SYS_LOOK[id].r * 0.86);
    scene.add(obj);
    sysLabels[id] = obj;
  }

  // Planetas y estación.
  const planets = {};
  const labels = {};
  for (const id of PORT_IDS) {
    const p = makePlanet(id, vis(id));
    p.userData.port = id;
    p.traverse((o) => (o.userData.port = id));
    scene.add(p);
    planets[id] = p;
  }
  const hq = miniStation();
  hq.scale.setScalar(2.4);
  hq.traverse((o) => (o.userData.port = 'hq'));
  scene.add(hq);

  function makeLabel(id) {
    const el = document.createElement('div');
    el.className = `lbl map-lbl ${id === 'hq' ? 'blue' : ''}`;
    el.dataset.port = id;
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1);
    scene.add(obj);
    return obj;
  }
  for (const id of [...PORT_IDS, ...GATE_IDS, 'hq']) labels[id] = makeLabel(id);

  function relabel() {
    for (const [id, obj] of Object.entries(sysLabels)) {
      const locked = SYSTEMS[id].level > state.level;
      obj.element.classList.toggle('locked', locked);
      obj.element.innerHTML = `<small>${t('map.system')}</small><b>${t(`sys.${id}`)}</b>${locked ? `<i>${icon('lock')}${t('map.locked', { n: SYSTEMS[id].level })}</i>` : ''}`;
    }
    for (const [id, obj] of Object.entries(labels)) {
      const locked = PORTS[id].level > state.level;
      const sells = PORTS[id].sells ?? [];
      const open = state.offers.filter((o) => o.to === id || o.from === id).length;
      obj.element.classList.toggle('locked', locked);
      obj.element.classList.toggle('gate', PORTS[id].kind === 'gate');
      obj.element.innerHTML = id === 'hq'
        ? `${icon('station')}<b>${t('port.hq')}</b>`
        : PORTS[id].kind === 'gate'
        ? `${icon('orbit')}<b>${t(`port.${id}`)}</b>${locked ? `<small>${icon('lock')}${t('map.locked', { n: PORTS[id].level })}</small>` : ''}`
        : `<b>${t(`port.${id}`)}</b>${sells.map((c) => `<span class="cg cg-${c} xs">${icon(c)}</span>`).join('')}${locked ? `<small>${icon('lock')}${t('map.locked', { n: PORTS[id].level })}</small>` : ''}${open && !locked ? `<i class="cnt">${open}</i>` : ''}`;
    }
  }

  // Naves.
  const ships = new Map();
  const routes = new Map();
  const tmp = new THREE.Vector3();

  function shipMesh(s) {
    const mesh = makeShip(s.model, s.name, shipStyle(s));
    mesh.scale.setScalar(SHIP_SCALE);
    mesh.traverse((x) => (x.userData.shipId = s.id));
    mesh.userData.shipId = s.id;
    scene.add(mesh);
    return mesh;
  }

  function shipObj(s) {
    let o = ships.get(s.id);
    const key = shipStyleKey(s);
    if (o && o.key !== key) {
      // Cambió la matrícula o un estético: se rearma la malla en el mismo lugar.
      const old = o.mesh;
      o.mesh = shipMesh(s);
      o.mesh.position.copy(old.position);
      o.mesh.rotation.copy(old.rotation);
      o.mesh.visible = old.visible;
      old.removeFromParent();
      Object.assign(o, { key, shown: -1, cargo: null });
    }
    if (!o) {
      o = { mesh: shipMesh(s), shown: -1, cargo: null, yaw: 0, key };
      ships.set(s.id, o);
    }
    return o;
  }

  function shipLabel(o, s) {
    if (!o.label) {
      const el = document.createElement('div');
      el.className = 'lbl ship-lbl';
      o.label = new CSS2DObject(el);
      o.label.center.set(0.5, 1.4);
      scene.add(o.label);
    }
    return o.label;
  }

  function routeLine(id) {
    let r = routes.get(id);
    if (!r) {
      r = fatLine([0, 0, 0, 1, 0, 0], { color: C.blue, width: 2.6, dashed: true, dash: 1.4, gap: 1.0 });
      scene.add(r);
      routes.set(id, r);
    }
    return r;
  }

  const pin = makePin();
  pin.scale.setScalar(2.4);
  pin.visible = false;
  scene.add(pin);
  let selected = null;
  let selPort = null;

  // Tarjeta de planeta.
  const card = document.createElement('section');
  card.className = 'detail card pcard';
  card.hidden = true;
  document.querySelector('.ui').appendChild(card);
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pact]');
    if (!b) return;
    if (b.dataset.pact === 'close') showPlanet(null);
    if (b.dataset.pact === 'market') onMarket?.(selPort);
  });

  function showPlanet(id) {
    selPort = id;
    card.hidden = !id;
    if (!id) return;
    renderCard();
  }

  function renderCard() {
    const id = selPort;
    if (!id) return;
    const P = PORTS[id];
    const locked = P.level > state.level;
    const { d, eta } = routeFromHq(id);
    const sells = (P.sells ?? []).map((c) => {
      const tr = priceTrend(id, c, state.t);
      return `<span class="cg cg-${c} xs">${icon(c)}</span>${t(`cargo.${c}`)} · <b>${money(buyPrice(id, c, state.t))}</b>/t <i class="trend ${tr > 0 ? 'rise' : 'fall'}">${icon(tr > 0 ? 'up' : 'down')}</i>`;
    }).join('');
    const buys = (P.buys ?? []).map((c) => `<span class="cg cg-${c} xs" title="${t(`cargo.${c}`)}">${icon(c)}</span>`).join('');
    const open = state.offers.filter((o) => o.to === id || o.from === id).length;
    card.innerHTML = `
      <div class="detail-head">
        ${id === 'hq' ? `<span class="hub-ic">${icon('station')}</span>` : `<span class="planet-dot pd-${id}"></span>`}
        <div><small>${t(`port.${id}.d`).toUpperCase()}</small><h4>${t(`port.${id}`)}</h4></div>
        <button class="x" data-pact="close">${icon('x')}</button>
      </div>
      ${locked ? `<div class="warn muted">${icon('lock')}${t('market.locked', { n: P.level })}</div>` : ''}
      ${sells ? `<div class="row"><small>${t('map.sells')}</small><b>${sells}</b></div>` : ''}
      ${buys ? `<div class="row"><small>${t('map.buys')}</small><b>${buys}</b></div>` : ''}
      ${id !== 'hq' ? `<div class="row"><small>${icon('route')}</small><b>${t('map.dist', { d: `${num(d)} u`, t: dur(eta) })}</b></div>` : ''}
      ${open ? `<div class="row"><small>${icon('orders')}</small><b>${t('map.orders', { n: open })}</b></div>` : ''}
      ${P.kind === 'gate' ? `<p class="gate-note">${icon('orbit')}${t('map.gateNote', { t: dur(JUMP.time) })}</p>` : ''}
      ${sells && !locked ? `<button class="btn primary sm wide" data-pact="market">${icon('cart')}${t('order.buyMore', { port: t(`port.${id}`) })}</button>` : ''}`;
  }

  /** Distancia y tiempo desde la estación con una nave liviana (pasando por los portales si hace falta). */
  function routeFromHq(id) {
    if (id === 'hq') return { d: 0, eta: 0 };
    const speed = SHIPS.colibri.speed * value(state, 'engines');
    const shields = value(state, 'shields') > 0;
    const from = position('hq', state.t);
    if (sysOf(id) === 'rift') {
      const r = intercept(from, id, state.t, speed, shields);
      return { d: dist(from, r.point), eta: r.time };
    }
    const a = intercept(from, 'portal', state.t, speed, shields);
    const gate = SYSTEMS[sysOf(id)].gate;
    const t1 = state.t + a.time + JUMP.time;
    const g = position(gate, t1);
    if (id === gate) return { d: dist(from, a.point), eta: a.time + JUMP.time };
    const b = intercept(g, id, t1, speed, shields);
    return { d: dist(from, a.point) + dist(g, b.point), eta: a.time + JUMP.time + b.time };
  }

  let cardT = 0;
  let labelT = 0;
  let firstEnter = true;
  const goal = new THREE.Vector3();

  function update(dt, now) {
    for (const fn of userUpdates) fn(now);
    const tSim = state.t;
    for (const sn of suns) {
      sn.userData.material.uniforms.uTime.value = now;
      sn.rotation.y += dt * 0.05;
    }
    for (const id of GATE_IDS) {
      const p = position(id, tSim);
      const gt = gates[id];
      gt.position.set(p.x, 1.5, p.z);
      // El portal mira hacia su estrella y gira despacio el remolino.
      const c = SYSTEMS[sysOf(id)];
      gt.rotation.y = Math.atan2(c.x - p.x, c.z - p.z);
      gt.userData.swirl.uniforms.uTime.value = now;
      labels[id].position.set(p.x, 7.2, p.z);
      const locked = PORTS[id].level > state.level;
      orbitLines[id].material.opacity = locked ? 0.18 : 0.45;
    }
    for (const ln of lanes) {
      const a = position(ln.a, tSim);
      const b = position(ln.b, tSim);
      ln.line.geometry.setPositions([a.x, 1.5, a.z, b.x, 1.5, b.z]);
      ln.line.computeLineDistances();
      ln.line.material.dashOffset -= dt * 4;
      ln.line.material.opacity = Math.max(PORTS[ln.a].level, PORTS[ln.b].level) > state.level ? 0.18 : 0.5;
    }
    belt.rotation.y += dt * 0.004;

    for (const id of PORT_IDS) {
      const p = position(id, tSim);
      const pl = planets[id];
      pl.position.set(p.x, 0, p.z);
      pl.userData.body.rotation.y += dt * 0.12;
      if (pl.userData.clouds) pl.userData.clouds.rotation.y += dt * 0.16;
      labels[id].position.set(p.x, vis(id) + 1.8, p.z);
      const locked = PORTS[id].level > state.level;
      pl.userData.body.material.color.setHex(locked ? 0x6a6f8f : 0xffffff);
      orbitLines[id].material.opacity = locked ? 0.35 : 0.7;
    }
    const h = position('hq', tSim);
    hq.position.set(h.x, 0, h.z);
    hq.rotation.y = -Math.atan2(h.z, h.x);
    labels.hq.position.set(h.x, 5.2, h.z);

    // Naves en el mapa: se ven las que están fuera de la estación.
    const seen = new Set();
    for (const s of state.ships) {
      seen.add(s.id);
      const o = shipObj(s);
      const r = routeLine(s.id);
      let pos = null;
      let yaw = o.yaw;
      let thrust = 0;
      let jumpScale = 1;
      if (s.status === 'travel') {
        const L = s.leg;
        pos = new THREE.Vector3(s.pos.x, SHIP_Y, s.pos.z);
        yaw = Math.atan2(L.to.x - L.from.x, L.to.z - L.from.z);
        thrust = 1;
        // Ruta: de la nave al punto de encuentro, del color de la carga.
        r.visible = true;
        r.geometry.setPositions([pos.x, SHIP_Y - 0.4, pos.z, L.to.x, SHIP_Y - 0.4, L.to.z]);
        r.computeLineDistances();
        r.material.color.setHex(s.load ? CARGO_COLORS[s.load.cargo] : C.blue);
        r.material.dashOffset -= dt * 3;
      } else {
        r.visible = false;
        if (s.status === 'portwork') {
          const p = position(s.port, tSim);
          const c = SYSTEMS[sysOf(s.port)];
          const rr = vis(s.port) + 2.4;
          const a = Math.atan2(p.z - c.z, p.x - c.x) + Math.PI;
          pos = new THREE.Vector3(p.x + Math.cos(a) * rr, SHIP_Y, p.z + Math.sin(a) * rr);
          thrust = 0.15;
        } else if (s.status === 'jump' && s.jump) {
          // Entra al portal achicándose y sale del otro creciendo.
          const k = Math.min(1, s.timer / s.dur);
          const leaving = k < 0.5;
          const g = position(leaving ? s.jump.from : s.jump.to, tSim);
          pos = new THREE.Vector3(g.x, SHIP_Y, g.z);
          jumpScale = leaving ? 1 - k * 2 : (k - 0.5) * 2;
          thrust = 1;
        }
      }
      o.mesh.visible = !!pos;
      const lbl = shipLabel(o, s);
      lbl.visible = !!pos;
      if (!pos) continue;
      o.mesh.position.copy(pos);
      o.mesh.scale.setScalar(SHIP_SCALE * Math.max(0.02, jumpScale));
      lbl.position.set(pos.x, pos.y + 1.6, pos.z);
      const etaAt = s.status === 'travel' ? s.leg.t0 + s.leg.dur : tSim + (s.dur - s.timer);
      const txt = `${s.load ? `<span class="cg cg-${s.load.cargo} xs">${icon(s.load.cargo)}</span>` : ''}<b>${s.name}</b><small>${dur(etaAt - tSim)}</small>`;
      if (lbl.element.innerHTML !== txt) lbl.element.innerHTML = txt;
      lbl.element.classList.toggle('sel', s.id === selected);
      let dy = yaw - o.yaw;
      dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      o.yaw += dy * (1 - Math.exp(-dt * 6));
      o.mesh.rotation.y = o.yaw;
      setThrust(o.mesh, thrust, now);
      const boxes = s.load ? Math.round(s.load.tons / 10) : 0;
      if (boxes !== o.shown || s.load?.cargo !== o.cargo) {
        setShipCargo(o.mesh, s.load?.cargo ?? null, boxes);
        o.shown = boxes;
        o.cargo = s.load?.cargo ?? null;
      }
    }
    for (const [id, o] of ships) {
      if (seen.has(id)) continue;
      o.mesh.removeFromParent();
      o.label?.removeFromParent();
      ships.delete(id);
      routes.get(id)?.removeFromParent();
      routes.delete(id);
    }

    // Pin sobre el destino de la nave elegida.
    const sel = state.ships.find((x) => x.id === selected);
    const dest = sel?.status === 'travel' ? sel.leg.target : sel?.status === 'portwork' ? sel.port : sel?.status === 'jump' ? sel.jump?.to : null;
    pin.visible = !!dest;
    if (dest) {
      const p = position(dest, tSim);
      pin.position.set(p.x, (PORTS[dest].kind === 'gate' ? 6 : vis(dest)) + 5.5 + Math.sin(now * 2.4) * 0.3, p.z);
      pin.userData.head.rotation.y = stage.rig.azimuth;
    }

    const { width, height } = stage.size;
    for (const r of routes.values()) r.material.resolution.set(width, height);
    for (const l of Object.values(orbitLines)) l.material.resolution.set(width, height);
    for (const ln of lanes) ln.line.material.resolution.set(width, height);
    // La luz de las sombras sigue a la cámara (así cada sistema tiene sus sombras).
    top.position.set(stage.rig.target.x - 30, 120, stage.rig.target.z + 40);
    top.target.position.set(stage.rig.target.x, 0, stage.rig.target.z);

    labelT += dt;
    if (labelT > 0.5) {
      labelT = 0;
      relabel();
    }
    cardT += dt;
    if (cardT > 0.5 && selPort) {
      cardT = 0;
      renderCard();
    }
  }

  function home() {
    focusSystem('rift');
  }

  /** Lleva la cámara a un sistema (o a todo el universo con 'all'). */
  function focusSystem(id) {
    stage.rig.follow = null;
    if (id === 'all') {
      stage.rig.goal.set(150, 0, 100);
      stage.rig.zoomGoal = 0.42;
    } else {
      stage.rig.goal.set(SYSTEMS[id].x, 0, SYSTEMS[id].z);
      stage.rig.zoomGoal = id === 'rift' ? 1.22 : 1.35;
    }
    nav.querySelectorAll('[data-sys]').forEach((b) => b.classList.toggle('on', b.dataset.sys === id));
  }

  // Botonera de sistemas (arriba del mapa).
  const nav = document.createElement('nav');
  nav.className = 'sys-nav card';
  nav.hidden = true;
  document.querySelector('.ui').appendChild(nav);
  function renderNav() {
    nav.innerHTML = [...SYSTEM_IDS, 'all'].map((id) => {
      const locked = id !== 'all' && SYSTEMS[id].level > state.level;
      return `<button data-sys="${id}" class="${locked ? 'locked' : ''}">${id === 'all' ? icon('globe') : `<i class="sys-dot sd-${id}"></i>`}<span>${id === 'all' ? t('map.all') : t(`sys.${id}`)}</span>${locked ? icon('lock') : ''}</button>`;
    }).join('');
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sys]');
    if (b) focusSystem(b.dataset.sys);
  });

  return {
    scene,
    enter() {
      stage.setScene(scene, { ao: { radius: 5, intensity: 2.2, falloff: 2.5 }, bloom: 0.3 });
      stage.rig.view = 220;
      stage.rig.bounds = { minX: -120, maxX: 440, minZ: -190, maxZ: 400 };
      stage.rig.minZoom = 0.32;
      stage.rig.maxZoom = 7;
      if (firstEnter) {
        firstEnter = false;
        stage.rig.goal.set(0, 0, 0);
        stage.rig.zoomGoal = 1.22;
      } else stage.rig.goal.copy(goal);
      stage.rig.target.copy(stage.rig.goal);
      stage.rig.zoom = stage.rig.zoomGoal;
      relabel();
      renderNav();
      nav.hidden = false;
      for (const l of [...Object.values(labels), ...Object.values(sysLabels)]) l.element.style.display = '';
      if (selPort) card.hidden = false;
    },
    leave() {
      goal.copy(stage.rig.goal);
      stage.rig.minZoom = 0.5;
      stage.rig.maxZoom = 3;
      card.hidden = true;
      nav.hidden = true;
      // Las etiquetas HTML quedan en la capa de etiquetas: se esconden al salir.
      for (const l of [...Object.values(labels), ...Object.values(sysLabels)]) l.element.style.display = 'none';
      for (const o of ships.values()) if (o.label) o.label.element.style.display = 'none';
    },
    update,
    home,
    focusSystem,
    relabel() {
      relabel();
      renderNav();
      renderCard();
    },
    select(id) { selected = id; },
    follow(id) {
      stage.rig.follow = () => {
        const s = state.ships.find((x) => x.id === id);
        if (!s) return stage.rig.goal;
        return tmp.set(s.pos.x, 0, s.pos.z);
      };
      stage.rig.zoomGoal = Math.max(stage.rig.zoomGoal, 2.4);
    },
    pick(ndc) {
      const meshes = [...ships.values()].filter((o) => o.mesh.visible).map((o) => o.mesh);
      const hitShip = stage.pick(ndc, meshes);
      if (hitShip) {
        let o = hitShip.object;
        while (o && o.userData.shipId == null) o = o.parent;
        if (o) return o.userData.shipId;
      }
      const hit = stage.pick(ndc, [...Object.values(planets), ...Object.values(gates), hq]);
      showPlanet(hit?.object.userData.port ?? null);
      return null;
    }
  };
}
