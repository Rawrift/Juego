import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/700.css';
import './styles.css';

import {
  createSim,
  stepSim,
  chooseUpgrade,
  summarize,
  botInput,
  botChoice,
  InputRecorder,
  DT,
  MAX_TICKS,
  SHIPS,
  WEAPONS,
  PASSIVES,
  shipYield
} from '../sim/index.js';
import { createRenderer } from './renderer.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createApi } from './api.js';
import { createWallet, explainError } from './wallet.js';
import { iconCanvas, drawShipPreview } from './sprites.js';
import { createPanels } from './panels.js';
import { $, el, toast, fmtTime, fmtNum, shortAddr, fmtRift, brandText } from './dom.js';

const canvas = $('#game');
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput({ surface: canvas, joystick: $('#joystick') });
const api = createApi();

const app = {
  api,
  audio,
  config: null,
  profile: null,
  wallet: null,
  balances: null,
  online: false,
  ship: loadShipChoice(),
  startRun,
  refreshProfile,
  connectWallet,
  selectShip,
  updateMenu
};
const panels = createPanels(app);

// --------------------------------------------------------------------- estado de juego

const game = {
  mode: 'demo', // demo | play | over
  sim: null,
  rec: null,
  run: null,
  acc: 0,
  paused: false,
  choiceOpen: false,
  autopilot: false,
  offline: false,
  hudSig: ''
};

function newDemo() {
  const keys = Object.keys(SHIPS);
  const ship = keys[Math.floor(Math.random() * keys.length)];
  game.sim = createSim({ seed: (Math.random() * 2 ** 32) >>> 0, ship, shipLevel: 5 });
  // Arranca la demo con algo de acción ya en pantalla.
  for (let i = 0; i < 60 * 25; i++) {
    if (game.sim.phase === 'choice') chooseUpgrade(game.sim, botChoice(game.sim));
    else stepSim(game.sim, botInput(game.sim));
    game.sim.events.length = 0;
  }
  renderer.reset();
}

function loadShipChoice() {
  try {
    const v = JSON.parse(localStorage.getItem('riftfall.ship') ?? 'null');
    if (v && SHIPS[v.key]) return v;
  } catch {
    /* ignorar */
  }
  return { key: 'spark', tokenId: null, level: 1 };
}

function selectShip(choice) {
  app.ship = choice;
  try {
    localStorage.setItem('riftfall.ship', JSON.stringify(choice));
  } catch {
    /* ignorar */
  }
  updateMenu();
}

// --------------------------------------------------------------------- menú

let previewT = 0;
function updateMenu() {
  const s = SHIPS[app.ship.key];
  $('#shipName').textContent = `${s.name}${app.ship.key !== 'spark' ? ` · NV ${app.ship.level}` : ''}`;
  $('#shipDesc').textContent = s.desc;
  $('#shipYield').textContent = `Recompensa x${shipYield(app.ship.key, app.ship.level).toFixed(2)}`;
  const p = app.profile;
  $('#menuShards').textContent = fmtNum(p?.shards ?? 0);
  if (app.balances) {
    $('#riftChip').classList.remove('hidden');
    $('#menuRift').textContent = fmtRift(app.balances.rift);
  }
  const wb = $('#walletBtn');
  if (p?.wallet) {
    wb.textContent = shortAddr(p.wallet);
    wb.classList.add('connected');
  } else {
    wb.textContent = app.config?.chain ? 'Conectar wallet' : 'Wallet (sin red)';
  }
  $('#streakTag').textContent = `Racha ${p?.streak ?? 0}🔥`;
  const list = $('#missionList');
  list.replaceChildren(
    ...(p?.missions ?? []).map((m) =>
      el('li', { class: m.done ? 'done' : '' }, [
        el('span', {}, `${m.done ? '✔ ' : ''}${m.name}`),
        el('b', {}, `+${m.reward} ◆`),
        el('div', { class: 'bar' }, [el('i', { style: `width:${Math.round((m.progress / m.goal) * 100)}%` })])
      ])
    )
  );
  if (!p) list.replaceChildren(el('li', {}, [el('span', {}, 'Conecta con el servidor para ver tus misiones.')]));
}

function setNet(text, cls) {
  const n = $('#netStatus');
  n.textContent = text;
  n.className = cls;
}

async function refreshProfile() {
  try {
    app.profile = await api.profile();
  } catch {
    /* sin servidor */
  }
  if (app.wallet?.connected) {
    try {
      app.balances = await app.wallet.balances();
    } catch {
      app.balances = null;
    }
  }
  updateMenu();
}

async function connectWallet() {
  if (!app.config?.chain) {
    toast('La blockchain no está configurada en este servidor. Puedes jugar como invitado.', 'err');
    return false;
  }
  try {
    const address = await app.wallet.connect();
    const { message } = await api.nonce(address);
    const signature = await app.wallet.signMessage(message);
    app.profile = await api.loginWallet(address, signature);
    app.balances = await app.wallet.balances();
    toast(`Wallet conectada: ${shortAddr(address)}`, 'ok');
    updateMenu();
    return true;
  } catch (err) {
    toast(explainError(err), 'err');
    return false;
  }
}

// --------------------------------------------------------------------- partida

async function startRun(mode = 'normal') {
  audio.unlock();
  audio.startMusic();
  panels.close();
  let run = null;
  game.offline = false;
  try {
    run = await api.startRun({
      mode,
      shipTokenId: app.ship.tokenId ?? undefined,
      demoShip: app.config?.demoShips ? app.ship.key : undefined
    });
  } catch (err) {
    if (err.status) {
      toast(err.message, 'err');
      return;
    }
    game.offline = true;
    run = { runId: null, seed: (Math.random() * 2 ** 32) >>> 0, ship: 'spark', shipLevel: 1, mode: 'normal' };
    toast('Sin conexión con el servidor: partida de práctica sin recompensas.', 'err');
  }
  game.run = run;
  game.sim = createSim({ seed: run.seed, ship: run.ship, shipLevel: run.shipLevel });
  game.rec = new InputRecorder();
  game.acc = 0;
  game.mode = 'play';
  game.paused = false;
  game.choiceOpen = false;
  game.hudSig = '';
  renderer.reset();
  renderer.render(game.sim, 1, 0, { snap: true });
  $('#menu').classList.add('hidden');
  $('#gameover').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#bossBar').classList.add('hidden');
  input.setEnabled(true);
  announce(run.mode === 'arena' ? 'ARENA' : 'SOBREVIVE', run.mode === 'arena' ? 'el mejor puntaje se lleva el bote' : 'el Rift se está abriendo', 'good');
}

function pickChoice(i) {
  const s = game.sim;
  if (!game.choiceOpen || s.phase !== 'choice' || !s.choice[i]) return;
  game.rec.choice(i);
  chooseUpgrade(s, i);
  audio.play('choose');
  game.choiceOpen = false;
  $('#levelup').classList.add('hidden');
  game.hudSig = '';
  if (s.phase === 'choice') openChoice();
}

function describeChoice(o) {
  if (o.kind === 'weapon') {
    const w = WEAPONS[o.id];
    return { title: w.name, text: w.desc[o.level - 1], color: w.color, icon: o.id, max: 5 };
  }
  if (o.kind === 'passive') {
    const p = PASSIVES[o.id];
    return { title: p.name, text: p.desc, color: '#ffc94d', icon: o.id, max: p.max };
  }
  if (o.kind === 'repair') return { title: 'Kit de reparación', text: 'Recupera 40% de la vida', color: '#4dff9a', icon: 'repair', max: 0 };
  return { title: 'Alijo de Shards', text: '+2 Shards', color: '#ffc94d', icon: 'cache', max: 0 };
}

function openChoice() {
  const s = game.sim;
  game.choiceOpen = true;
  $('#levelupTitle').textContent = `NIVEL ${s.player.level - s.pendingLevels + 1}`;
  const box = $('#choices');
  box.replaceChildren(
    ...s.choice.map((o, i) => {
      const d = describeChoice(o);
      const card = el('button', { class: 'choice', style: `--accent:${d.color}` }, [
        o.level === 1 && o.kind !== 'repair' && o.kind !== 'cache'
          ? el('span', { class: 'tag new' }, 'NUEVO')
          : o.level
            ? el('span', { class: 'tag' }, `NV ${o.level}`)
            : null,
        iconCanvas(d.icon, d.color, 128),
        el('h4', {}, d.title),
        el('p', {}, d.text),
        d.max ? el('div', { class: 'pips' }, Array.from({ length: d.max }, (_, k) => el('i', { class: k < o.level ? 'on' : '' }))) : null,
        el('span', { class: 'key' }, `[${i + 1}]`)
      ]);
      card.querySelector('canvas').classList.add('ico');
      card.addEventListener('click', () => pickChoice(i));
      return card;
    })
  );
  $('#levelup').classList.remove('hidden');
}

async function endRun() {
  game.mode = 'over';
  input.setEnabled(false);
  const s = game.sim;
  const local = summarize(s);
  const victory = s.phase === 'victory';
  audio.setIntensity(0.15);
  setTimeout(() => showGameOver(local, victory), victory ? 600 : 1300);
}

async function showGameOver(local, victory) {
  const card = $('.gameover-card');
  card.classList.toggle('victory', victory);
  card.classList.toggle('defeat', !victory);
  const retreat = !victory && game.sim.phase !== 'dead';
  $('#goKicker').textContent = victory ? 'VICTORIA' : 'FIN DE LA PARTIDA';
  $('#goTitle').textContent = victory ? 'RIFT SELLADO' : retreat ? 'RETIRADA' : 'NAVE DESTRUIDA';
  $('#goStats').replaceChildren(
    ...[
      ['TIEMPO', fmtTime(local.timeSec)],
      ['BAJAS', fmtNum(local.kills)],
      ['NIVEL', local.level],
      ['PUNTAJE', fmtNum(local.score)]
    ].map(([k, v]) => el('div', {}, [el('small', {}, k), el('b', {}, String(v))]))
  );
  const verify = $('#goVerify');
  const list = $('#goRewardList');
  list.replaceChildren();
  $('#goTotal').textContent = '…';
  $('#hud').classList.add('hidden');
  $('#gameover').classList.remove('hidden');

  if (game.offline || !game.run?.runId) {
    verify.className = 'verify err';
    verify.textContent = 'Partida de práctica: sin conexión, no genera recompensas.';
    $('#goTotal').textContent = '0';
    return;
  }
  verify.className = 'verify';
  verify.replaceChildren(el('span', { class: 'spinner' }), 'Verificando partida en el servidor (re-simulación completa)…');
  try {
    const res = await api.finishRun({ runId: game.run.runId, ...game.rec.finish() });
    verify.className = 'verify ok';
    verify.textContent = '✔ Partida verificada: el servidor re-simuló cada tick y obtuvo el mismo resultado.';
    const rows = [];
    if (game.run.mode === 'arena') rows.push(['Puntaje registrado en la Arena', fmtNum(res.summary.score), false]);
    else {
      rows.push([`Botín de la partida (x${res.summary.yieldMult.toFixed(2)} por tu nave)`, res.rewards.run]);
      if (res.rewards.streak) rows.push([`Bonus de racha diaria`, res.rewards.streak]);
      for (const m of res.rewards.missions) rows.push([`Misión: ${m.name}`, m.reward]);
    }
    rows.forEach(([label, v, isShard = true], i) => {
      const li = el('li', { style: `animation-delay:${0.15 + i * 0.12}s` }, [el('span', {}, label), el('b', {}, isShard === false ? v : `+${v} ◆`)]);
      list.append(li);
    });
    countUp($('#goTotal'), res.totalShards);
    if (res.totalShards > 0) setTimeout(() => audio.play('shard'), 400);
    app.profile = res.profile;
    updateMenu();
  } catch (err) {
    verify.className = 'verify err';
    verify.textContent = `✖ ${err.message}`;
    $('#goTotal').textContent = '0';
  }
}

function countUp(node, target) {
  const t0 = performance.now();
  const dur = 900;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    node.textContent = fmtNum(Math.round(target * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function backToMenu() {
  game.mode = 'demo';
  $('#gameover').classList.add('hidden');
  $('#hud').classList.add('hidden');
  $('#pause').classList.add('hidden');
  $('#levelup').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  input.setEnabled(false);
  newDemo();
  refreshProfile();
}

function setPaused(v) {
  if (game.mode !== 'play') return;
  game.paused = v;
  $('#pause').classList.toggle('hidden', !v);
  if (v) {
    const box = $('#pauseLoadout');
    box.replaceChildren(...loadoutSlots(game.sim));
  }
}

// --------------------------------------------------------------------- HUD

let announceTimer = null;
function announce(title, sub, cls = 'good') {
  const a = $('#announce');
  a.className = '';
  a.replaceChildren(document.createTextNode(title), sub ? el('small', {}, sub) : '');
  void a.offsetWidth;
  a.className = `show ${cls}`;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => (a.className = ''), 2700);
}

function loadoutSlots(s) {
  const slots = [];
  for (const w of s.player.weapons) {
    slots.push(el('div', { class: 'slot', title: WEAPONS[w.id].name }, [iconCanvas(w.id, WEAPONS[w.id].color, 60), el('b', {}, String(w.level))]));
  }
  for (const p of s.player.passives) {
    slots.push(el('div', { class: 'slot passive', title: PASSIVES[p.id].name }, [iconCanvas(p.id, '#ffc94d', 60), el('b', {}, String(p.level))]));
  }
  return slots;
}

const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  document.getElementById(id).textContent = v;
}
function setWidth(id, pct) {
  const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  document.getElementById(id).style.width = v;
}

function updateHud(s) {
  const p = s.player;
  setWidth('xpFill', (p.xp / p.xpNext) * 100);
  setText('levelTag', `NV ${p.level}`);
  setText('hpText', `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`);
  setWidth('hpFill', (p.hp / p.stats.maxHp) * 100);
  setWidth('hpGhost', (p.hp / p.stats.maxHp) * 100);
  setText('timer', fmtTime(Math.floor(s.tick / 60)));
  setText('killCount', fmtNum(s.kills));
  setText('shardCount', fmtNum(s.shards));
  const boss = s.boss && !s.boss.dead ? s.boss : null;
  $('#bossBar').classList.toggle('hidden', !boss);
  if (boss) setWidth('bossFill', (boss.hp / boss.maxHp) * 100);
  const sig = [...p.weapons.map((w) => w.id + w.level), ...p.passives.map((x) => x.id + x.level)].join();
  if (sig !== game.hudSig) {
    game.hudSig = sig;
    $('#loadout').replaceChildren(...loadoutSlots(s));
  }
}

function onSimEvent(ev, s, live) {
  renderer.handleEvent(ev, s);
  if (!live) return;
  audio.event(ev);
  switch (ev.t) {
    case 'warning':
      if (ev.kind === 'boss') announce('⚠ GUARDIÁN DEL RIFT', 'se aproxima', 'danger');
      else announce('ENJAMBRE', 'te están rodeando', 'danger');
      break;
    case 'bossDead':
      announce('GUARDIÁN DERROTADO', '+ Shards de jefe', 'good');
      break;
    case 'hurt': {
      const f = $('#hurtFlash');
      f.classList.add('on');
      setTimeout(() => f.classList.remove('on'), 60);
      if (navigator.vibrate) navigator.vibrate(30);
      break;
    }
    default:
  }
}

// --------------------------------------------------------------------- bucle principal

let last = performance.now();
let frameAvg = 16;
let qualityLowered = false;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
  if (!qualityLowered && frameAvg > 24 && now > 8000) {
    qualityLowered = true;
    renderer.setQuality(0.6);
  }

  const s = game.sim;
  if (game.mode === 'play' && !game.paused) {
    if (s.phase === 'running') {
      game.acc += dt;
      let steps = 0;
      while (game.acc >= DT && s.phase === 'running' && steps < 8) {
        const d = game.autopilot ? botInput(s) : input.dir();
        game.rec.push(d);
        stepSim(s, d);
        game.acc -= DT;
        steps++;
      }
      if (s.phase !== 'running') game.acc = 0;
    }
    for (const ev of s.events) onSimEvent(ev, s, true);
    s.events.length = 0;
    if (s.phase === 'choice' && !game.choiceOpen) openChoice();
    if (s.phase === 'choice' && game.autopilot && game.choiceOpen) pickChoice(botChoice(s));
    if (s.phase === 'dead' || s.phase === 'victory') endRun();
    audio.setIntensity(s.boss && !s.boss.dead ? 1 : 0.5 + Math.min(0.45, s.tick / MAX_TICKS));
    updateHud(s);
  } else if (game.mode === 'demo') {
    game.acc += dt;
    while (game.acc >= DT) {
      if (s.phase === 'choice') chooseUpgrade(s, botChoice(s));
      if (s.phase !== 'running') {
        newDemo();
        break;
      }
      stepSim(s, botInput(s));
      game.acc -= DT;
    }
    for (const ev of game.sim.events) onSimEvent(ev, game.sim, false);
    game.sim.events.length = 0;
  } else if (game.mode === 'over') {
    for (const ev of s.events) onSimEvent(ev, s, true);
    s.events.length = 0;
  }

  const alpha = game.mode === 'play' && s.phase === 'running' ? game.acc / DT : 1;
  renderer.render(game.sim, alpha, game.paused ? 0 : dt);

  if (game.mode !== 'play') {
    previewT += dt;
    if (!$('#menu').classList.contains('hidden')) {
      drawShipPreview($('#shipPreview'), app.ship.key, SHIPS[app.ship.key].color, previewT);
    }
  }
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------- eventos de UI

$('#playBtn').addEventListener('click', () => startRun('normal'));
$('#againBtn').addEventListener('click', () => startRun(game.run?.mode === 'arena' ? 'arena' : 'normal'));
$('#menuBtn').addEventListener('click', backToMenu);
$('#pauseBtn').addEventListener('click', () => setPaused(true));
$('#resumeBtn').addEventListener('click', () => setPaused(false));
$('#quitBtn').addEventListener('click', () => {
  setPaused(false);
  $('#levelup').classList.add('hidden');
  game.choiceOpen = false;
  endRun();
});
$('#walletBtn').addEventListener('click', async () => {
  audio.unlock();
  if (app.profile?.wallet && app.wallet?.connected) panels.open('profile');
  else await connectWallet();
});
$('#muteBtn').addEventListener('click', () => {
  audio.unlock();
  $('#muteBtn').classList.toggle('off', audio.toggleMute());
});
$('#muteBtn').classList.toggle('off', audio.muted);
document.querySelectorAll('[data-open]').forEach((b) =>
  b.addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    panels.open(b.dataset.open);
  })
);
window.addEventListener('keydown', (e) => {
  if (game.mode === 'play') {
    if (game.choiceOpen && ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(e.code)) {
      pickChoice(Number(e.code.slice(-1)) - 1);
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      setPaused(!game.paused);
    }
  } else if (e.code === 'Escape') {
    panels.close();
  } else if (e.code === 'Enter' && game.mode === 'demo' && $('#sheet').classList.contains('hidden')) {
    startRun('normal');
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play' && !game.choiceOpen) setPaused(true);
});
if (matchMedia('(pointer: coarse)').matches) {
  $('#controlsHint').textContent = 'Arrastra el dedo en cualquier parte para moverte · las armas disparan solas';
}

// --------------------------------------------------------------------- arranque

async function boot() {
  newDemo();
  requestAnimationFrame(frame);
  updateMenu();
  try {
    app.config = await api.config();
    app.profile = await api.session();
    app.online = true;
    if (app.config.chain) {
      brandText($('#menu'), app.config.chain.tokenSymbol);
      app.wallet = createWallet(app.config.chain);
      app.wallet.onChange(() => location.reload());
      setNet(`● En línea · red ${app.config.chain.network} (${app.config.chain.chainId})`, 'ok');
    } else {
      setNet('● En línea · blockchain no configurada (modo invitado)', 'warn');
    }
    if (app.ship.tokenId && !app.config.chain) selectShip({ key: 'spark', tokenId: null, level: 1 });
  } catch {
    setNet('● Sin servidor: modo práctica sin recompensas', 'warn');
  }
  updateMenu();
}

boot();

// Gancho para pruebas automatizadas y capturas (piloto automático y avance rápido).
// Solo existe en desarrollo y en el build de tests (`npm run build:e2e`): en producción
// no se expone, para no regalar un bot de farmeo a un clic de la consola.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') window.__RIFTFALL__ = {
  game,
  app,
  startRun,
  pickChoice,
  setPaused,
  setAutopilot(v) {
    game.autopilot = v;
  },
  fastForward(seconds) {
    const s = game.sim;
    const end = s.tick + seconds * 60;
    while (s.tick < end && (s.phase === 'running' || s.phase === 'choice')) {
      if (s.phase === 'choice') {
        const c = botChoice(s);
        game.rec.choice(c);
        chooseUpgrade(s, c);
        game.choiceOpen = false;
        continue;
      }
      const d = botInput(s);
      game.rec.push(d);
      stepSim(s, d);
      s.events.length = 0;
    }
    $('#levelup').classList.add('hidden');
  }
};
