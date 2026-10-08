// Arranque de Rift Cargo: carga la partida guardada (y lo que pasó mientras no estabas), arma la
// escena de la estación y el mapa, la interfaz, y corre el bucle del juego.

import './styles.css';
import { createStage } from './render/stage.js';
import { createStation } from './render/station.js';
import { createMap } from './render/map.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio.js';
import { t, lang, money } from './i18n.js';
import { load, save, clear } from './save.js';
import { receiveCargoTransfer, applyCargoTransfer, owned, signText, setSign, metamaskLink } from './style.js';
import { moveIfOldHost, receiveMove } from '../rift/move.js';
import { applyTransfer } from '../client/transfer.js';
import { start as startAccount, createSync, syncPurchases, isReloading } from '../rift/account.js';
import { createAccountUI } from '../rift/account-ui.js';
import { configureFiat, loadFiat } from '../rift/fiat-ui.js';
import { configureMp, loadMp } from '../rift/mercadopago-ui.js';
import { setStationSign } from './render/stationScene.js';
import { step, acceptOffer, buyCargo, buyUpgrade, buyShip, evolveShip, setAuto, fastForward, newGame, ownerBoost } from './sim/sim.js';
import { OFFLINE_MAX } from './sim/data.js';
import { TO_CARGO, pending as bridgePending, riftfallProgress } from '../rift/bridge.js';

await document.fonts.load('800 100px "Plus Jakarta Sans"').catch(() => {});

// Si se llegó desde el link de MetaMask (o de la mudanza), primero se trae la partida y los estéticos.
await receiveMove({ applyRiftfall: (d) => applyTransfer(d), applyCargo: applyCargoTransfer });
await receiveCargoTransfer();
// Aplicar antes de mudarse conserva el progreso entrante y permite reenviarlo sin secretos.
if (await moveIfOldHost()) await new Promise(() => {});

// Cuenta Rift: antes de cargar la partida se trae la de la nube (si la de otro dispositivo avanzó
// más, se juega esa). Sin servidor o sin conexión, se sigue con la del dispositivo.
const SAVE_KEY = 'riftcargo.save';
const readSave = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const earned = (d) => d?.state?.stats?.earned ?? -1;
/** Queda la partida que más ganó en total; si empatan, la más nueva. */
const mergeSaves = (a, b) => (!a ? b : !b ? a : earned(b) > earned(a) || (earned(b) === earned(a) && (b.at ?? 0) > (a.at ?? 0)) ? b : a);
let booted = false;
/** Al recargar para jugar la partida de la nube, no hay que guardar encima la de memoria. */
let reloading = false;
const cloud = createSync('cargo', {
  get: readSave,
  merge: mergeSaves,
  apply(d) {
    // Durante el juego, si gana la partida de otro dispositivo, se recarga para jugar esa.
    const mine = readSave();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    } catch {
      /* sin almacenamiento */
    }
    if (booted && d !== mine && earned(d) > earned(mine)) {
      reloading = true;
      location.reload();
    }
  },
  // Si dos dispositivos juegan a la vez, manda el que está jugando ahora (sin recargar en medio).
  resolve: (local) => local,
  delay: 60_000
});
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
await withTimeout(startAccount().then((a) => (a ? cloud.pull().then(() => syncPurchases()) : null)), 3500);

const { state, away } = load();
// Desde acá, si la nube trae una partida que avanzó más, hay que recargar para jugarla.
booted = true;
// Estéticos: solo se muestra lo que el jugador tiene (compras y Pase Fundador).
function reconcileLooks() {
  const mine = owned();
  for (const s of state.ships) {
    if (s.baseName && !mine.has('plates')) s.name = s.baseName;
    if (!s.look) continue;
    if (!mine.has(`liv-${s.look.livery}`)) s.look.livery = 'rift';
    if (!mine.has(`trail-${s.look.trail}`)) s.look.trail = 'cian';
  }
}
reconcileLooks();
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
    buyShip: (m) => buyShip(state, m, owned()),
    evolve: (shipId) => evolveShip(state, shipId),
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
    openAccount: (opts) => accountUI.open(opts),
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

// Panel del dueño: cada herramienta cambia la partida en juego y la guarda (local y en la nube).
const boost = (kind) => () => {
  ownerBoost(state, kind);
  save(state);
  cloud.schedule();
};
const accountUI = createAccountUI({
  game: 'cargo',
  lang: () => lang,
  toast: (msg, kind) => ui.toast(`<span>${msg.replace(/[<>&]/g, '')}</span>`, kind === 'err' ? 'err' : 'ok', 4200),
  onChange: () => ui.renderAll(true),
  owner: { credits: boost('credits'), level: boost('level'), upgrades: boost('upgrades'), evolve: boost('evolve') },
  // En el celular sin wallet: Rift Cargo se abre en MetaMask con tu cuenta y tu partida.
  walletLink: () => {
    save(state);
    return metamaskLink();
  }
});
// Pago en pesos: solo aparece si el servidor lo tiene configurado.
configureFiat({ lang: () => lang, toast: (msg, kind) => ui.toast(`<span>${msg.replace(/[<>&]/g, '')}</span>`, kind === 'err' ? 'err' : 'ok', 4200), openAccount: () => accountUI.open(), onPaid: () => ui.renderAll(true) });
loadFiat().then((c) => c.enabled && ui.renderAll(true));
configureMp({ lang: () => lang, toast: (msg, kind) => ui.toast(`<span>${msg.replace(/[<>&]/g, '')}</span>`, kind === 'err' ? 'err' : 'ok', 4200), openAccount: () => accountUI.open(), onPaid: (order) => {
  reconcileLooks(); setStationSign(signText());
  ui.refreshPurchases(order.state === 'paid');
  save(state);
} });
loadMp().then((c) => c.enabled && ui.renderAll(true));

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
  if (saveT > 5 && !reloading && !isReloading()) {
    saveT = 0;
    save(state);
    cloud.schedule();
  }
});
const persist = () => reloading || isReloading() || save(state);
// Con la pestaña escondida el navegador frena el juego: al volver se simula el tiempo que pasó.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (reloading || isReloading()) return;
    persist();
    cloud.flush();
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
window.addEventListener('pagehide', () => {
  if (reloading || isReloading()) return;
  persist();
  cloud.flush();
});

/** Ruta Rift: lo logrado en RIFTFALL da créditos acá (una vez por escalón). */
function claimBridge() {
  const got = bridgePending(TO_CARGO, state.flags.bridge ?? 0, riftfallProgress());
  if (!got.length) return;
  const v = got.reduce((a, g) => a + g.credits, 0);
  state.credits += v;
  state.flags.bridge = got[got.length - 1].index + 1;
  save(state);
  cloud.schedule();
  setTimeout(() => ui.toast(`${t('bridge.got', { v: money(v) })}`, 'ok', 5200), 900);
}
claimBridge();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && claimBridge());

ui.renderAll(true);
// Los gráficos se preparan sin trabar la pantalla (si tarda más de 4 s, arranca igual).
withTimeout(stage.precompile(), 4000).then(() => stage.start());
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

// Solo desarrollo y pruebas: el build publicado no expone el estado ni los controles de simulación.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') window.__CARGO__ = { state, stage, station, setView, step, fastForward, newGame, get view() { return view; }, get map() { return map; } };
