// La estación en movimiento: ubica las naves según lo que dice la simulación (estacionadas, en los
// muelles, despegando, llegando), anima los drones que mueven contenedores entre las estanterías y
// las naves, y llena las estanterías con el stock real del depósito.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t as tr } from '../i18n.js';
import { UPGRADES } from '../sim/data.js';
import { buildStationScene, dockCenter, parkCenter, dronePad, PARK, PAD, DOCK_X } from './stationScene.js';
import { makeShip, makeDrone, makeContainer, containerMaterial, setShipCargo, setThrust, shipDims, makePin, userUpdates, DRONE_SCALE } from './models.js';
import { padTexture, parkTexture } from './textures.js';
import { mat } from './kit.js';
import { position } from '../sim/orbit.js';
import { BOX, DRONE_CYCLE, CARGO_IDS } from '../sim/data.js';
import { value, depotCap } from '../sim/sim.js';

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const RACK_MODULES = { 120: 1, 240: 2, 360: 3, 600: 5, 1080: 9 };
const APPROACH = new THREE.Vector3(4, 7.5, 9);
const FAR = 75;

/** Pose (posición + giro) de una nave estacionada o en un muelle: centrada en su lugar, mirando a +Z. */
function spotPose(model, center, isDock) {
  const d = shipDims(model);
  const back = d.back;
  if (isDock) {
    // La cola de la nave queda cerca del portón.
    return { p: new THREE.Vector3(center.x, 0.06, PAD.z0 + 0.7 + back), yaw: 0 };
  }
  return { p: new THREE.Vector3(center.x, 0.06, center.z + (back - d.front) / 2), yaw: 0 };
}

export function createStation(stage, state) {
  const st = buildStationScene({ docks: value(state, 'docks'), shadow: stage.quality.shadow });
  const { scene } = st;
  const ships = new Map();
  const drones = [];
  const carried = [];
  let shownDocks = -1;

  // ---------- Estanterías: un lugar por contenedor, se llenan en orden ----------
  const slots = [];
  st.racks.forEach((rack, ri) => {
    rack.updateMatrixWorld(true);
    for (const local of rack.userData.slots) slots.push({ rack: ri, pos: rack.localToWorld(local.clone()), cargo: null, mesh: null });
  });
  const shown = Object.fromEntries(CARGO_IDS.map((c) => [c, 0]));

  function syncRacks() {
    const modules = RACK_MODULES[depotCap(state)] ?? 9;
    st.racks.forEach((r, i) => (r.visible = i < modules));
    const usable = modules * 12;
    for (const c of CARGO_IDS) {
      const want = Math.round(state.stock[c] / BOX);
      while (shown[c] > want) {
        const s = [...slots].reverse().find((x) => x.cargo === c);
        if (!s) break;
        s.mesh.removeFromParent();
        s.mesh = null;
        s.cargo = null;
        shown[c]--;
      }
      while (shown[c] < want) {
        const s = slots.slice(0, usable).find((x) => !x.cargo);
        if (!s) break;
        s.cargo = c;
        s.mesh = makeContainer(c);
        s.mesh.position.copy(s.pos);
        scene.add(s.mesh);
        shown[c]++;
      }
    }
  }
  /** Los últimos `n` lugares ocupados con la carga `c` (de ahí salen los próximos contenedores). */
  const lastOf = (c, n) => slots.filter((x) => x.cargo === c).slice(-n).reverse();
  const firstFree = (n) => slots.filter((x, i) => !x.cargo && st.racks[x.rack].visible).slice(0, n);

  // ---------- Drones ----------
  function syncDrones() {
    const n = Math.min(8, value(state, 'drones'));
    while (drones.length < n) {
      const d = makeDrone();
      const home = dronePad(drones.length).add(new THREE.Vector3(0, 0.55, 0));
      d.position.copy(home);
      d.userData.home = home;
      d.userData.spin = 0;
      scene.add(d);
      drones.push(d);
      const c = makeContainer('agua');
      c.visible = false;
      scene.add(c);
      carried.push(c);
    }
  }

  // ---------- Muelles, hangar y estanterías por comprar ----------
  let shownHangar = -1;
  let shownModules = -1;
  function syncPads() {
    const n = value(state, 'docks');
    if (n !== shownDocks) {
      shownDocks = n;
      st.pads.forEach((m, i) => {
        const locked = i >= n;
        m.material = mat(0xffffff, { map: padTexture(`D${i + 1}`, { locked }), transparent: locked, rough: 0.75 });
        st.works[i].visible = locked;
      });
    }
    const h = value(state, 'hangar');
    if (h !== shownHangar) {
      shownHangar = h;
      st.parking.forEach((m, i) => (m.material = mat(0xffffff, { map: parkTexture(`H${i + 1}`, i >= h), transparent: true, rough: 0.8 })));
    }
    const modules = RACK_MODULES[depotCap(state)] ?? 9;
    if (modules !== shownModules) {
      shownModules = modules;
      // Se muestran como "por construir" solo los dos módulos siguientes.
      st.ghosts.forEach((g, i) => (g.visible = i >= modules && i < modules + 2));
    }
  }

  // ---------- Naves ----------
  function shipObj(s) {
    let o = ships.get(s.id);
    if (!o) {
      o = { mesh: makeShip(s.model, s.name), shown: 0, cargo: null };
      o.mesh.userData.shipId = s.id;
      scene.add(o.mesh);
      ships.set(s.id, o);
    }
    return o;
  }

  const tmp = new THREE.Vector3();
  const hqNow = () => position('hq', state.t);
  /** Dirección (en el plano) desde la estación hacia un lugar del mapa. */
  function headingTo(target, t) {
    const a = position('hq', t);
    const b = typeof target === 'string' ? position(target, t) : target;
    return Math.atan2(b.z - a.z, b.x - a.x);
  }
  const yawFor = (dx, dz) => Math.atan2(dx, dz);

  function lerpPose(a, b, k, lift = 5) {
    const p = a.p.clone().lerp(b.p, k);
    p.y += Math.sin(Math.PI * k) * lift;
    let dy = b.yaw - a.yaw;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return { p, yaw: a.yaw + dy * k };
  }

  /** Vuelo de llegada/salida en dos tramos: horizontal en altura y vertical sobre el lugar. */
  function hopPose(from, to, k) {
    const high = to.p.clone().setY(6);
    if (k < 0.55) {
      const e = ease(k / 0.55);
      const fromHigh = from.p.y > 3 ? from.p : from.p.clone().setY(Math.max(from.p.y, 6 * Math.min(1, e * 3)));
      const p = fromHigh.clone().lerp(high, e);
      const yaw = Math.atan2(high.x - from.p.x, high.z - from.p.z);
      return { p, yaw: Math.abs(high.x - from.p.x) + Math.abs(high.z - from.p.z) > 0.5 ? yaw : to.yaw, thrust: 0.8 };
    }
    const e = ease((k - 0.55) / 0.45);
    const p = high.clone().lerp(to.p, e);
    const yaw0 = Math.atan2(high.x - from.p.x, high.z - from.p.z);
    let dy = to.yaw - yaw0;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return { p, yaw: yaw0 + dy * Math.min(1, e * 1.6), thrust: 0.45 * (1 - e) + 0.15 };
  }

  function homePose(s) {
    return spotPose(s.model, parkCenter(s.park), false);
  }
  function dockPose(s, i = s.dock >= 0 ? s.dock : s.lastDock ?? 0) {
    return spotPose(s.model, dockCenter(i), true);
  }
  const airPose = () => ({ p: APPROACH.clone(), yaw: Math.PI * 0.75 });

  function shipPose(s) {
    switch (s.status) {
      case 'parked':
        return { ...homePose(s), thrust: 0 };
      case 'queued':
        if (s.from === 'park') return { ...homePose(s), thrust: 0 };
        return { p: APPROACH.clone().add(new THREE.Vector3(-6.5 * queueIndex(s), Math.sin(state.t * 1.4 + s.id) * 0.25, 0)), yaw: Math.PI * 0.75, thrust: 0.35 };
      case 'docking': {
        const from = s.from === 'park' ? homePose(s) : airPose();
        return hopPose(from, dockPose(s), clamp01(s.timer / s.dur));
      }
      case 'landing': {
        const from = s.from === 'dock' ? dockPose(s, s.lastDock) : airPose();
        return hopPose(from, homePose(s), clamp01(s.timer / s.dur));
      }
      case 'docked':
      case 'working':
      case 'waitdrones':
        return { ...dockPose(s), thrust: 0 };
      case 'liftoff': {
        const from = s.from === 'dock' ? dockPose(s, s.lastDock) : homePose(s);
        const k = clamp01(s.timer / s.dur);
        const h = headingTo(s.liftTo, state.t);
        const out = new THREE.Vector3(Math.cos(h) * FAR, 20, Math.sin(h) * FAR);
        if (k < 0.35) {
          const e = ease(k / 0.35);
          const p = from.p.clone();
          p.y += e * 8;
          return { p, yaw: from.yaw, thrust: 0.6 };
        }
        const e = Math.pow((k - 0.35) / 0.65, 2);
        const start = from.p.clone().setY(from.p.y + 8);
        const p = start.clone().lerp(out, e);
        const want = yawFor(out.x - start.x, out.z - start.z);
        let dy = want - from.yaw;
        dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        return { p, yaw: from.yaw + dy * Math.min(1, ((k - 0.35) / 0.65) * 3), thrust: 1 };
      }
      case 'travel': {
        const L = s.leg;
        const left = L.t0 + L.dur - state.t;
        if (L.target !== 'hq' || left > 4) return null;
        const k = 1 - left / 4;
        const h = Math.atan2(L.from.z - L.to.z, L.from.x - L.to.x);
        const far = new THREE.Vector3(Math.cos(h) * FAR, 20, Math.sin(h) * FAR);
        const e = 1 - Math.pow(1 - k, 2);
        const p = far.clone().lerp(APPROACH, e);
        return { p, yaw: yawFor(APPROACH.x - far.x, APPROACH.z - far.z), thrust: 1 - e * 0.5 };
      }
      default:
        return null;
    }
  }

  function queueIndex(s) {
    return state.ships.filter((x) => x.status === 'queued' && x.from !== 'park' && x.id < s.id).length;
  }

  function updateShips(dt, t) {
    const seen = new Set();
    for (const s of state.ships) {
      seen.add(s.id);
      const o = shipObj(s);
      const pose = shipPose(s);
      const wasVisible = o.mesh.visible;
      o.mesh.visible = !!pose;
      if (!pose) continue;
      // Se suaviza un poco el giro y la posición para que no haya saltos entre tramos.
      if (!wasVisible || o.yaw == null) {
        o.mesh.position.copy(pose.p);
        o.yaw = pose.yaw;
      } else {
        o.mesh.position.lerp(pose.p, 1 - Math.exp(-dt * 14));
        let dy = pose.yaw - o.yaw;
        dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        o.yaw += dy * (1 - Math.exp(-dt * 7));
      }
      o.mesh.rotation.y = o.yaw;
      // Inclinación suave al volar.
      o.mesh.rotation.z = pose.thrust > 0.5 ? Math.sin(t * 1.3 + s.id) * 0.03 : 0;
      setThrust(o.mesh, pose.thrust ?? 0, t);
      o.mesh.userData.legs.visible = pose.p.y < 2.5;
      const boxes = s.load ? Math.round(s.load.tons / BOX) : 0;
      const cargo = s.load?.cargo ?? null;
      if (boxes !== o.shown || cargo !== o.cargo) {
        setShipCargo(o.mesh, cargo, boxes);
        o.shown = boxes;
        o.cargo = cargo;
      }
      for (const nl of o.mesh.userData.navLights) nl.visible = Math.sin(t * 4 + s.id) > -0.2;
    }
    for (const [id, o] of ships) {
      if (!seen.has(id)) {
        o.mesh.removeFromParent();
        ships.delete(id);
      }
    }
  }

  // ---------- Trabajo de los drones en los muelles ----------
  const hookOffset = new THREE.Vector3(0, -(0.36 + 0.4 + 0.02) * DRONE_SCALE, -0.06 * DRONE_SCALE);
  const sources = new Map(); // `${shipId}:${wave}` → posiciones de los contenedores de esa tanda

  function updateDrones(dt, t) {
    let next = 0;
    const working = state.ships.filter((s) => s.status === 'working' && s.work).sort((a, b) => a.dock - b.dock);
    const assigned = new Set();
    for (const s of working) {
      const w = s.work;
      const o = ships.get(s.id);
      if (!o) continue;
      o.mesh.updateMatrixWorld(true);
      const wave = Math.floor(w.t / DRONE_CYCLE);
      const phase = w.t / DRONE_CYCLE - wave;
      const key = `${s.id}:${wave}`;
      if (!sources.has(key)) {
        // Al empezar la tanda se anotan de dónde salen y adónde van los contenedores.
        const count = Math.min(w.k, w.n - wave * w.k);
        const rackSpots = w.kind === 'load' ? lastOf(w.cargo, count).map((x) => x.pos.clone()) : firstFree(count).map((x) => x.pos.clone());
        sources.set(key, rackSpots);
        sources.delete(`${s.id}:${wave - 2}`);
      }
      const rackSpots = sources.get(key);
      const nextSpots = w.kind === 'load' ? lastOf(w.cargo, w.k).map((x) => x.pos) : firstFree(w.k).map((x) => x.pos);
      for (let j = 0; j < w.k && next < drones.length; j++, next++) {
        const d = drones[next];
        assigned.add(next);
        const i = wave * w.k + j;
        const fallback = new THREE.Vector3(-14, 1.2, -2);
        const rackPos = rackSpots[j] ?? fallback;
        const slotIdx = w.kind === 'load' ? i : w.n - 1 - i;
        const shipSlot = o.mesh.localToWorld((o.mesh.userData.slots[Math.max(0, slotIdx)] ?? new THREE.Vector3()).clone());
        const active = i < w.n;
        let a;
        let b;
        let carrying;
        if (!active) {
          a = b = shipSlot.clone().add(new THREE.Vector3(j * 1.2 - 1, 2.5, 2));
          carrying = false;
        } else if (phase < 0.5) {
          a = w.kind === 'load' ? rackPos : shipSlot;
          b = w.kind === 'load' ? shipSlot : rackPos;
          carrying = true;
        } else {
          a = w.kind === 'load' ? shipSlot : rackPos;
          const nxt = (wave + 1) * w.k + j < w.n ? (w.kind === 'load' ? nextSpots[j] ?? fallback : shipSlot) : d.userData.home.clone().sub(hookOffset);
          b = nxt;
          carrying = false;
        }
        const k = ease(clamp01(phase < 0.5 ? phase / 0.5 : (phase - 0.5) / 0.5));
        const p = a.clone().lerp(b, k);
        p.y += Math.sin(Math.PI * k) * 2.4 + 0.25;
        const target = p.clone().sub(hookOffset);
        const prev = d.position.clone();
        d.position.lerp(target, 1 - Math.exp(-dt * 18));
        const mv = d.position.clone().sub(prev);
        if (mv.lengthSq() > 1e-6) d.rotation.y = Math.atan2(mv.x, mv.z);
        d.userData.spin = 1;
        const c = carried[next];
        c.visible = carrying && active;
        if (c.visible) {
          if (c.userData.cargo !== w.cargo) {
            c.material = containerMaterial(w.cargo);
            c.userData.cargo = w.cargo;
          }
          d.updateMatrixWorld(true);
          c.position.copy(d.position).add(hookOffset);
          c.rotation.y = d.rotation.y + Math.PI / 2;
        }
      }
    }
    if (sources.size > 40) for (const k of [...sources.keys()].slice(0, 20)) sources.delete(k);
    // Los demás vuelven a su plataforma de carga.
    drones.forEach((d, i) => {
      if (assigned.has(i)) return;
      carried[i].visible = false;
      const home = d.userData.home;
      d.position.lerp(home, 1 - Math.exp(-dt * 3));
      if (d.position.distanceTo(home) < 0.05) d.userData.spin = Math.max(0, d.userData.spin - dt * 0.6);
    });
    for (const d of drones) {
      for (const r of d.userData.rotors) r.rotation.y += dt * (6 + d.userData.spin * 40);
      d.userData.beacon.visible = d.userData.spin > 0.2 ? Math.sin(t * 6 + d.id) > 0 : true;
    }
  }

  // ---------- Carteles de los muelles (estado de cada uno) ----------
  const dockLabels = DOCK_X.map((x, i) => {
    const el = document.createElement('div');
    el.className = 'lbl dock-lbl';
    const o = new CSS2DObject(el);
    const c = dockCenter(i);
    o.position.set(c.x, 0.3, c.z + PAD.l / 2 + 0.3);
    o.center.set(0.5, 0);
    scene.add(o);
    return o;
  });
  function updateDockLabels() {
    const n = value(state, 'docks');
    dockLabels.forEach((o, i) => {
      let html;
      if (i >= n) {
        const lv = UPGRADES.docks[i]?.level ?? 1;
        html = `<i class="dot lock"></i><b>D${i + 1}</b><small>${tr('up.needLevel', { n: lv })}</small>`;
      } else {
        const ship = state.ships.find((x) => x.dock === i);
        if (!ship) html = `<i class="dot"></i><b>D${i + 1}</b><small>${tr('pill.idle')}</small>`;
        else {
          const w = ship.work;
          const what = ship.status === 'working' ? `${w.kind === 'unload' ? tr('status.unloading') : tr('pill.loading')} ${Math.min(w.n, w.dropped)}/${w.n}` : tr(`status.${ship.status}`);
          html = `<i class="dot busy"></i><b>D${i + 1}</b><small>${ship.name} · ${what}</small>`;
        }
      }
      if (o.element.innerHTML !== html) o.element.innerHTML = html;
    });
  }

  // ---------- Pin sobre lo seleccionado ----------
  const pin = makePin();
  pin.scale.setScalar(1.4);
  pin.visible = false;
  scene.add(pin);
  let selected = null;

  syncPads();
  syncDrones();
  syncRacks();

  return {
    scene,
    st,
    ships,
    select(id) { selected = id; },
    /** Las etiquetas HTML de esta escena se esconden al ir al mapa. */
    showLabels(v) { for (const o of dockLabels) o.element.style.display = v ? '' : 'none'; },
    /** Nave bajo el cursor (o null). */
    pickShip(ndc) {
      const meshes = [...ships.values()].filter((o) => o.mesh.visible).map((o) => o.mesh);
      const hit = stage.pick(ndc, meshes);
      let o = hit?.object;
      while (o && o.userData.shipId == null) o = o.parent;
      return o?.userData.shipId ?? null;
    },
    /** Posición en el mundo de una nave (para seguirla con la cámara o poner etiquetas). */
    shipPosition(id) {
      const o = ships.get(id);
      return o?.mesh.visible ? o.mesh.position : null;
    },
    update(dt, t) {
      for (const fn of userUpdates) fn(t);
      syncPads();
      syncDrones();
      syncRacks();
      updateShips(dt, t);
      updateDrones(dt, t);
      updateDockLabels();
      st.clouds.uniforms.uTime.value = t;
      st.tower.radar.rotation.y += dt * 0.9;
      st.tower.beacon.visible = Math.sin(t * 3) > -0.3;
      const sp = selected != null ? ships.get(selected) : null;
      pin.visible = !!sp?.mesh.visible;
      if (pin.visible) {
        const d = shipDims(sp.mesh.userData.model);
        pin.position.copy(sp.mesh.position).add(new THREE.Vector3(0, d.height + 1.4 + Math.sin(t * 2.4) * 0.18, 0));
        pin.userData.head.rotation.y = stage.rig.azimuth;
      }
    }
  };
}
