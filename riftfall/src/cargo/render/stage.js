// El "escenario": renderer, cámara isométrica con paneo/zoom/giro suaves, oclusión ambiental (N8AO)
// y etiquetas HTML sobre la escena. Sirve para las dos vistas (estación y mapa del sistema).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { N8AOPass } from 'n8ao';
import { setMaxAnisotropy } from './textures.js';

const lerp = (a, b, k) => a + (b - a) * k;
const portrait = (aspect) => (aspect < 0.8 ? Math.min(2.1, 0.95 / aspect) : 1);
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
function dampAngle(a, b, rate, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-rate * dt));
}

/** Calidad según el equipo: en celulares se baja la resolución y la oclusión va a media resolución. */
export function pickQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const low = coarse || small || (navigator.hardwareConcurrency ?? 8) <= 4;
  const forced = new URLSearchParams(location.search).get('q');
  const fixed = !!forced;
  if (forced === 'low' || (low && forced !== 'high')) return { name: 'low', dpr: 1.5, ao: 'half', shadow: 2048, smaa: false, fixed };
  return { name: 'high', dpr: forced === 'high' ? 2 : 1.75, ao: 'full', shadow: 4096, smaa: true, fixed };
}

export function createStage(host, quality = pickQuality()) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'stage-canvas';
  host.appendChild(renderer.domElement);
  setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'stage-labels';
  host.appendChild(labels.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.5, 1200);
  const rig = {
    target: new THREE.Vector3(),
    goal: new THREE.Vector3(),
    azimuth: Math.PI / 4,
    azimuthGoal: Math.PI / 4,
    elevation: 0.62,
    view: 40, // alto visible en unidades del mundo (con zoom 1)
    zoom: 1,
    zoomGoal: 1,
    minZoom: 0.5,
    maxZoom: 3,
    bounds: null, // { minX, maxX, minZ, maxZ }
    follow: null // función que devuelve un Vector3 a seguir
  };

  let scene = null;
  let composer = null;
  let aoPass = null;
  let bloomPass = null;
  let smaaPass = null;
  let width = 1;
  let height = 1;

  function buildComposer() {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType }));
    aoPass = new N8AOPass(scene, camera, width, height);
    const cfg = aoPass.configuration;
    cfg.gammaCorrection = false;
    cfg.aoRadius = 2.2;
    cfg.distanceFalloff = 1.2;
    cfg.intensity = 3.2;
    cfg.color = new THREE.Color(0x02030c);
    cfg.halfRes = quality.ao === 'half';
    aoPass.setQualityMode(quality.ao === 'half' ? 'Low' : 'Medium');
    composer.addPass(aoPass);
    // Brillo de las luces de neón (solo lo muy luminoso: tiras, motores, carteles).
    bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.32, 1.15);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    if (quality.smaa) {
      smaaPass = new SMAAPass();
      composer.addPass(smaaPass);
    }
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }

  function setScene(s, { ao = { radius: 2.2, intensity: 3.2, falloff: 1.2 }, bloom = 0.55 } = {}) {
    scene = s;
    scene.environment = envMap;
    if (!composer) buildComposer();
    aoPass.scene = scene;
    aoPass.configuration.aoRadius = ao.radius;
    aoPass.configuration.intensity = ao.intensity;
    aoPass.configuration.distanceFalloff = ao.falloff;
    bloomPass.strength = bloom;
  }

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;
    labels.setSize(width, height);
    composer?.setSize(width, height);
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function applyCamera() {
    const aspect = width / height;
    // En pantallas angostas (celular vertical) se ve más alto para que entre lo ancho.
    const view = rig.view / rig.zoom * portrait(aspect);
    camera.left = (-view * aspect) / 2;
    camera.right = (view * aspect) / 2;
    camera.top = view / 2;
    camera.bottom = -view / 2;
    const dist = 400;
    const ce = Math.cos(rig.elevation);
    camera.position.set(
      rig.target.x + Math.sin(rig.azimuth) * ce * dist,
      rig.target.y + Math.sin(rig.elevation) * dist,
      rig.target.z + Math.cos(rig.azimuth) * ce * dist
    );
    camera.near = 1;
    camera.far = dist * 2.4;
    camera.lookAt(rig.target);
    // Corrimiento en pantalla (para que lo importante no quede tapado por los paneles).
    if (rig.offsetPx) {
      const u = view / height;
      camera.translateX(rig.offsetPx.x * u);
      camera.translateY(rig.offsetPx.y * u);
    }
    camera.updateProjectionMatrix();
  }

  function clampGoal() {
    const b = rig.bounds;
    if (!b) return;
    rig.goal.x = Math.min(b.maxX, Math.max(b.minX, rig.goal.x));
    rig.goal.z = Math.min(b.maxZ, Math.max(b.minZ, rig.goal.z));
  }

  // ---------- Controles: arrastrar = mover, rueda/pellizco = zoom, botón derecho/dos dedos = girar ----------
  const el = renderer.domElement;
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let moved = 0;
  const listeners = { click: [] };

  /** Cuántas unidades del mundo mide un píxel con el zoom actual. */
  const unitsPerPx = () => rig.view / rig.zoom * portrait(width / height) / height;

  function panBy(dxPx, dyPx) {
    const u = unitsPerPx();
    const right = new THREE.Vector3(Math.cos(rig.azimuth), 0, -Math.sin(rig.azimuth));
    const fwd = new THREE.Vector3(-Math.sin(rig.azimuth), 0, -Math.cos(rig.azimuth));
    rig.follow = null;
    rig.goal.addScaledVector(right, -dxPx * u);
    rig.goal.addScaledVector(fwd, (dyPx * u) / Math.sin(rig.elevation));
    clampGoal();
  }

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, rotate: e.button === 2 || e.shiftKey };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), zoom: rig.zoomGoal, az: rig.azimuthGoal };
      drag = null;
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      rig.zoomGoal = Math.min(rig.maxZoom, Math.max(rig.minZoom, pinch.zoom * (dist / pinch.dist)));
      rig.azimuthGoal = pinch.az - (angle - pinch.angle);
      moved += 10;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (drag.rotate) rig.azimuthGoal -= dx * 0.006;
    else panBy(dx, dy);
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (drag && moved < 6 && e.type === 'pointerup') {
        const r = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        for (const fn of listeners.click) fn(ndc, e);
      }
      drag = null;
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0012);
    rig.zoomGoal = Math.min(rig.maxZoom, Math.max(rig.minZoom, rig.zoomGoal * k));
  }, { passive: false });

  const raycaster = new THREE.Raycaster();
  function pick(ndc, objects) {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, true)[0] ?? null;
  }

  /** Punto de la pantalla (px) de un punto del mundo. */
  function toScreen(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height, visible: p.z < 1 };
  }

  // Calidad automática: si el equipo no llega a ~40 cuadros por segundo se baja de a un escalón
  // (sin suavizado extra, oclusión a media resolución, menos resolución).
  const governor = { t: 0, frames: 0, level: 0, cooldown: 3 };
  function govern(raw) {
    governor.t += raw;
    governor.frames++;
    governor.cooldown -= raw;
    if (governor.t < 2) return;
    const avg = governor.t / governor.frames;
    governor.t = 0;
    governor.frames = 0;
    if (avg < 0.025 || governor.cooldown > 0 || !composer) return;
    governor.cooldown = 3;
    governor.level++;
    if (governor.level === 1 && smaaPass) composer.removePass(smaaPass);
    else if (governor.level === 2) aoPass.configuration.halfRes = true;
    else if (governor.level === 3 || governor.level === 4) {
      renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.4));
      composer.setPixelRatio(renderer.getPixelRatio());
      resize();
    } else if (governor.level === 5) aoPass.setQualityMode('Performance');
    else if (governor.level === 6 && bloomPass) bloomPass.resolution.set(width / 2, height / 2);
  }

  let last = performance.now();
  const frameFns = [];
  let running = true;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    // La simulación usa el tiempo real (aunque el equipo dibuje pocos cuadros por segundo); las
    // animaciones usan un paso acotado para no dar saltos.
    const raw = Math.min(1, Math.max(0, (now - last) / 1000));
    const dt = Math.min(0.05, raw);
    last = now;
    if (rig.follow) rig.goal.copy(rig.follow());
    rig.target.x = damp(rig.target.x, rig.goal.x, 6, dt);
    rig.target.y = damp(rig.target.y, rig.goal.y, 6, dt);
    rig.target.z = damp(rig.target.z, rig.goal.z, 6, dt);
    rig.zoom = damp(rig.zoom, rig.zoomGoal, 8, dt);
    rig.azimuth = dampAngle(rig.azimuth, rig.azimuthGoal, 7, dt);
    applyCamera();
    if (!document.hidden && !quality.fixed) govern(raw);
    for (const fn of frameFns) fn(dt, now / 1000, raw);
    if (scene) {
      composer.render(dt);
      labels.render(scene, camera);
    }
  }

  return {
    renderer, camera, rig, labels, quality, envMap,
    setScene,
    onFrame: (fn) => frameFns.push(fn),
    onClick: (fn) => listeners.click.push(fn),
    pick,
    toScreen,
    panBy,
    start() { running = true; last = performance.now(); requestAnimationFrame(frame); },
    stop() { running = false; },
    zoomBy(k) { rig.zoomGoal = Math.min(rig.maxZoom, Math.max(rig.minZoom, rig.zoomGoal * k)); },
    rotateBy(a) { rig.azimuthGoal += a; },
    get size() { return { width, height }; },
    /** Saca una captura (para el kit de redes y los tests). */
    snapshot() { composer.render(0); return renderer.domElement.toDataURL('image/png'); }
  };
}
