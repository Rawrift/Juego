// Mapa del sistema: el sol, los planetas en sus órbitas, el cinturón de asteroides, la estación y
// las naves viajando con su ruta. Estilo claro, como una maqueta sobre una mesa.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { makePlanet, makeSun } from './planets.js';
import { makeShip, setShipCargo, setThrust, makePin, userUpdates } from './models.js';
import { rbox, mat, part, bake } from './kit.js';
import { C, CARGO_COLORS } from './palette.js';
import { solarTexture } from './textures.js';
import { icon } from '../icons.js';
import { t, money, dur, num } from '../i18n.js';
import { PORTS, PORT_IDS, BELT, SHIPS } from '../sim/data.js';
import { position, dist, intercept } from '../sim/orbit.js';
import { buyPrice, priceTrend, value } from '../sim/sim.js';

const SHIP_SCALE = 1.05;
const SHIP_Y = 2.2;
/** En el mapa los planetas se dibujan más grandes que su tamaño "real" para que se lean bien. */
const vis = (id) => PORTS[id].radius * (id === 'nimbus' ? 1.55 : 2.2);

function circlePoints(r, n = 256) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  return pts;
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
  const sunLight = new THREE.PointLight(0xfff0dc, 2.8, 0, 0);
  scene.add(sunLight);
  const top = new THREE.DirectionalLight(0x9fb0ff, 0.35);
  top.position.set(-30, 120, 40);
  top.castShadow = true;
  top.shadow.mapSize.set(2048, 2048);
  Object.assign(top.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 300 });
  top.shadow.radius = 6;
  top.shadow.bias = -0.0005;
  scene.add(top, top.target);

  // Mesa: disco claro con anillos finos y una sombra suave de cada planeta.
  const floorY = -9;
  {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(512, 512, 0, 512, 512, 512);
    grd.addColorStop(0, 'rgba(40,30,110,0.55)');
    grd.addColorStop(0.55, 'rgba(18,16,60,0.45)');
    grd.addColorStop(1, 'rgba(4,5,14,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = 'rgba(77,232,255,0.13)';
    for (let x = 16; x < 1024; x += 24) for (let y = 16; y < 1024; y += 24) {
      const d = Math.hypot(x - 512, y - 512);
      if (d < 470) g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(128, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    floor.position.y = floorY;
    floor.userData.cannotReceiveAO = true;
    scene.add(floor);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(124, 96).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.25, color: 0x000000 }));
    shadow.position.y = floorY + 0.05;
    shadow.receiveShadow = true;
    shadow.userData.treatAsOpaque = true;
    scene.add(shadow);
  }

  // Estrellas de fondo (puntos fijos muy lejos) y una nebulosa suave de la grieta.
  {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const tint = [[1, 1, 1], [0.6, 0.9, 1], [1, 0.6, 0.9], [0.8, 0.7, 1]];
    for (let i = 0; i < n; i++) {
      pos.set([(rnd() - 0.5) * 900, -60 - rnd() * 220, (rnd() - 0.5) * 900], i * 3);
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

  // Órbitas.
  const orbitLines = {};
  for (const id of Object.keys(PORTS)) {
    const isHq = id === 'hq';
    const line = fatLine(circlePoints(PORTS[id].orbit), { color: isHq ? C.blue : 0x7b6cff, width: isHq ? 2 : 1.4, dashed: true, dash: isHq ? 2.4 : 1.2, gap: isHq ? 1.6 : 1.4, opacity: isHq ? 0.9 : 0.55 });
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

  // Sol.
  const sun = makeSun(6.5);
  scene.add(sun);

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
  for (const id of [...PORT_IDS, 'hq']) labels[id] = makeLabel(id);

  function relabel() {
    for (const [id, obj] of Object.entries(labels)) {
      const locked = PORTS[id].level > state.level;
      const sells = PORTS[id].sells ?? [];
      const open = state.offers.filter((o) => o.to === id || o.from === id).length;
      obj.element.classList.toggle('locked', locked);
      obj.element.innerHTML = id === 'hq'
        ? `${icon('station')}<b>${t('port.hq')}</b>`
        : `<b>${t(`port.${id}`)}</b>${sells.map((c) => `<span class="cg cg-${c} xs">${icon(c)}</span>`).join('')}${locked ? `<small>${icon('lock')}${t('map.locked', { n: PORTS[id].level })}</small>` : ''}${open && !locked ? `<i class="cnt">${open}</i>` : ''}`;
    }
  }

  // Naves.
  const ships = new Map();
  const routes = new Map();
  const tmp = new THREE.Vector3();

  function shipObj(s) {
    let o = ships.get(s.id);
    if (!o) {
      const mesh = makeShip(s.model, s.name);
      mesh.scale.setScalar(SHIP_SCALE);
      mesh.traverse((x) => (x.userData.shipId = s.id));
      mesh.userData.shipId = s.id;
      scene.add(mesh);
      o = { mesh, shown: -1, cargo: null, yaw: 0 };
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
    const here = id === 'hq' ? position('hq', state.t) : position(id, state.t);
    const d = dist(here, position('hq', state.t));
    const eta = id === 'hq' ? 0 : intercept(position('hq', state.t), id, state.t, SHIPS.colibri.speed * value(state, 'engines'), value(state, 'shields') > 0).time;
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
      ${sells && !locked ? `<button class="btn primary sm wide" data-pact="market">${icon('cart')}${t('order.buyMore', { port: t(`port.${id}`) })}</button>` : ''}`;
  }

  let cardT = 0;
  let labelT = 0;
  let firstEnter = true;
  const goal = new THREE.Vector3();

  function update(dt, now) {
    for (const fn of userUpdates) fn(now);
    const tSim = state.t;
    sun.userData.material.uniforms.uTime.value = now;
    sun.rotation.y += dt * 0.05;
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
          const rr = vis(s.port) + 2.4;
          const a = Math.atan2(p.z, p.x) + Math.PI;
          pos = new THREE.Vector3(p.x + Math.cos(a) * rr, SHIP_Y, p.z + Math.sin(a) * rr);
          thrust = 0.15;
        }
      }
      o.mesh.visible = !!pos;
      const lbl = shipLabel(o, s);
      lbl.visible = !!pos;
      if (!pos) continue;
      o.mesh.position.copy(pos);
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
    const dest = sel?.status === 'travel' ? sel.leg.target : sel?.status === 'portwork' ? sel.port : null;
    pin.visible = !!dest;
    if (dest) {
      const p = position(dest, tSim);
      pin.position.set(p.x, vis(dest) + 5.5 + Math.sin(now * 2.4) * 0.3, p.z);
      pin.userData.head.rotation.y = stage.rig.azimuth;
    }

    const { width, height } = stage.size;
    for (const r of routes.values()) r.material.resolution.set(width, height);
    for (const l of Object.values(orbitLines)) l.material.resolution.set(width, height);

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
    stage.rig.goal.set(0, 0, 0);
    stage.rig.zoomGoal = 1.22;
  }

  return {
    scene,
    enter() {
      stage.setScene(scene, { ao: { radius: 5, intensity: 2.2, falloff: 2.5 }, bloom: 0.3 });
      stage.rig.view = 220;
      stage.rig.bounds = { minX: -110, maxX: 110, minZ: -110, maxZ: 110 };
      stage.rig.minZoom = 0.6;
      stage.rig.maxZoom = 7;
      if (firstEnter) {
        firstEnter = false;
        stage.rig.goal.set(0, 0, 0);
        stage.rig.zoomGoal = 1.22;
      } else stage.rig.goal.copy(goal);
      stage.rig.target.copy(stage.rig.goal);
      stage.rig.zoom = stage.rig.zoomGoal;
      relabel();
      for (const l of Object.values(labels)) l.element.style.display = '';
      if (selPort) card.hidden = false;
    },
    leave() {
      goal.copy(stage.rig.goal);
      stage.rig.minZoom = 0.5;
      stage.rig.maxZoom = 3;
      card.hidden = true;
      // Las etiquetas HTML quedan en la capa de etiquetas: se esconden al salir.
      for (const l of Object.values(labels)) l.element.style.display = 'none';
      for (const o of ships.values()) if (o.label) o.label.element.style.display = 'none';
    },
    update,
    home,
    relabel() {
      relabel();
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
      const hit = stage.pick(ndc, [...Object.values(planets), hq]);
      showPlanet(hit?.object.userData.port ?? null);
      return null;
    }
  };
}
