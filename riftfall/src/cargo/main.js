// Arranque de Rift Cargo: carga la partida guardada (y lo que pasó mientras no estabas), arma la
// escena de la estación y el mapa, la interfaz, y corre el bucle del juego.

import './styles.css';
import { createStage } from './render/stage.js';
import { createStation } from './render/station.js';
import { createMap } from './render/map.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio.js';
import { t } from './i18n.js';
import { load, save, clear } from './save.js';
import { receiveCargoTransfer, owned, signText, setSign } from './style.js';
import { setStationSign } from './render/stationScene.js';
import { step, acceptOffer, buyCargo, buyUpgrade, buyShip, setAuto, fastForward, newGame } from './sim/sim.js';
import { OFFLINE_MAX } from './sim/data.js';

await document.fonts.load('800 100px "Plus Jakarta Sans"').catch(() => {});

// Si se llegó desde el link de MetaMask, primero se trae la partida y los estéticos.
if (new URLSearchParams(location.search).has('rf')) await receiveCargoTransfer();

const { state, away } = load();
// Estéticos: solo se muestra lo que el jugador tiene (compras y Pase Fundador).
{
  const mine = owned();
  for (const s of state.ships) {
    if (s.baseName && !mine.has('plates')) s.name = s.baseName;
    if (!s.look) continue;
    if (!mine.has(`liv-${s.look.livery}`)) s.look.livery = 'rift';
    if (!mine.has(`trail-${s.look.trail}`)) s.look.trail = 'cian';
  }
}
setStationSign(signText());
const stage = createStage(document.getElementById('stage'));
const station = createStation(stage, state);
const audio = createAudio();
let map = null;
let view = 'station';
let speed = 1;
let selected = null;

const HOME = { x: -6, z: -1, zoom: 1.45 };
stage.rig.view = 44;
stage.rig.bounds = { minX: -34, maxX: 34, minZ: -24, maxZ: 24 };
stage.rig.goal.set(HOME.x, 0, HOME.z);
stage.rig.target.copy(stage.rig.goal);
stage.rig.zoom = stage.rig.zoomGoal = HOME.zoom;
stage.setScene(station.scene);
const stationCam = { goal: stage.rig.goal.clone(), zoom: HOME.zoom, az: stage.rig.azimuthGoal };

function setView(v) {
  if (v === view) return;
  if (v === 'map') {
    if (!map) map = createMap(stage, state, { onMarket: (port) => ui.goMarket(port) });
    stationCam.goal.copy(stage.rig.goal);
    stationCam.zoom = stage.rig.zoomGoal;
    stationCam.az = stage.rig.azimuthGoal;
    stage.rig.follow = null;
    station.showLabels(false);
    map.enter();
  } else {
    map?.leave();
    station.showLabels(true);
    stage.setScene(station.scene, { ao: { radius: 2.2, intensity: 3.2, falloff: 1.2 } });
    stage.rig.view = 44;
    stage.rig.bounds = { minX: -34, maxX: 34, minZ: -24, maxZ: 24 };
    stage.rig.goal.copy(stationCam.goal);
    stage.rig.target.copy(stationCam.goal);
    stage.rig.zoom = stage.rig.zoomGoal = stationCam.zoom;
    stage.rig.azimuth = stage.rig.azimuthGoal = stationCam.az;
  }
  view = v;
  ui.setView(v);
  audio.play('click');
}

function select(id) {
  selected = id;
  station.select(id);
  map?.select(id);
  ui.select(id);
}

const ui = createUI({
  state,
  isMap: () => view === 'map',
  actions: {
    accept: (offerId, shipId) => acceptOffer(state, offerId, shipId),
    buy: (port, shipId) => buyCargo(state, port, shipId),
    upgrade: (id) => buyUpgrade(state, id),
    buyShip: (m) => buyShip(state, m),
    setAuto: (shipId, mode) => setAuto(state, shipId, mode),
    setView,
    setSpeed: (v) => (speed = v),
    select: (id) => select(id),
    follow(id) {
      if (view === 'map') map.follow(id);
      else stage.rig.follow = () => station.shipPosition(id) ?? stage.rig.goal;
    },
    cam(v) {
      if (v === 'in') stage.zoomBy(1.3);
      else if (v === 'out') stage.zoomBy(1 / 1.3);
      else if (v === 'left') stage.rotateBy(Math.PI / 4);
      else if (v === 'right') stage.rotateBy(-Math.PI / 4);
      else if (v === 'home') {
        stage.rig.follow = null;
        if (view === 'map') map.home();
        else {
          stage.rig.goal.set(HOME.x, 0, HOME.z);
          stage.rig.zoomGoal = HOME.zoom;
          stage.rig.azimuthGoal = Math.round((stage.rig.azimuthGoal - Math.PI / 4) / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 4;
        }
      }
    },
    sound: (k) => audio.play(k),
    toggleSound: () => audio.toggle(),
    isMuted: () => audio.muted,
    langChanged: () => map?.relabel(),
    restyle: () => save(state),
    persist: () => save(state),
    setSign(text) {
      if (!setSign(text)) return false;
      setStationSign(signText());
      return true;
    },
    reset() {
      clear();
      location.reload();
    }
  }
});

// Elegir naves tocándolas en la escena.
stage.onClick((ndc) => {
  const id = view === 'map' ? map.pick(ndc) : station.pickShip(ndc);
  if (id != null) select(id);
});

/** El panel de la derecha tapa parte de la escena: se corre la cámara para centrar lo visible. */
function updateOffset() {
  const ops = document.getElementById('ops');
  const w = window.innerWidth >= 761 ? ops.offsetWidth + 16 : 0;
  stage.rig.offsetPx = { x: w / 2, y: window.innerWidth < 761 ? 30 : 0 };
}
window.addEventListener('resize', updateOffset);
updateOffset();

let saveT = 0;
stage.onFrame((dt, now, raw) => {
  step(state, raw * speed);
  const events = state.events.splice(0);
  ui.update(dt, events, raw);
  // Las animaciones usan suavizados exponenciales: con el tiempo real no se atrasan en equipos lentos.
  const anim = Math.min(raw, 0.25);
  if (view === 'station') station.update(anim, now);
  else map.update(anim, now);
  saveT += dt;
  if (saveT > 5) {
    saveT = 0;
    save(state);
  }
});
const persist = () => save(state);
// Con la pestaña escondida el navegador frena el juego: al volver se simula el tiempo que pasó.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    persist();
    return;
  }
  const gone = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0;
  hiddenAt = 0;
  if (gone > 3) {
    const sum = fastForward(state, Math.min(OFFLINE_MAX, gone));
    state.events.length = 0;
    if (gone > 60) ui.showAway(sum);
  }
});
window.addEventListener('pagehide', persist);

ui.renderAll(true);
stage.start();
if (away && away.seconds > 60) ui.showAway(away);
else ui.tutorial();
// Un pago de estéticos que quedó sin confirmar la vez anterior se verifica solo.
setTimeout(() => ui.checkPending(), 2500);
document.title = `${t('brand')} · ${t('hub.name')}`;

// Estadísticas de visitas (Vercel Web Analytics) solo en el sitio publicado.
if (/(^|\.)duckdns\.org$|\.vercel\.app$/.test(location.hostname)) {
  const sc = document.createElement('script');
  sc.defer = true;
  sc.src = '/_vercel/insights/script.js';
  document.head.appendChild(sc);
}

// Gancho para pruebas automáticas (no se usa en el juego).
window.__CARGO__ = { state, stage, station, setView, step, fastForward, newGame, get view() { return view; }, get map() { return map; } };
