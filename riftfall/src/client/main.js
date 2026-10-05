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
import { iconCopy, drawShipPreview } from './sprites.js';
import { createPanels } from './panels.js';
import { chainConfigFromDeployment } from '../shared/networks.js';
import { $, el, toast, fmtTime, fmtNum, shortAddr, fmtRift, brandText } from './dom.js';
import { t, tx, lang, LANGS, setLang, applyStatic } from './i18n.js';
import { loadProgress, recordLocalRun, upgradeLocalTalent, localMissions, canUpgradeAny } from './progress.js';
import { shareResult } from './share.js';

applyStatic();

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
  progress: loadProgress(),
  ship: loadShipChoice(),
  startRun,
  refreshProfile,
  connectWallet,
  selectShip,
  updateMenu,
  pilot,
  upgradeTalent
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

/** Progreso del piloto: el del servidor si está en línea, si no el guardado en este dispositivo. */
function pilot() {
  if (app.online && app.profile) {
    const p = app.profile;
    return { online: true, cores: p.cores ?? 0, talents: p.talents ?? {}, missions: p.missions ?? [], streak: p.streak ?? 0, stats: p };
  }
  const p = app.progress;
  return { online: false, cores: p.cores, talents: p.talents, missions: localMissions(p), streak: p.streak, stats: p };
}

async function upgradeTalent(id) {
  if (app.online && app.profile) {
    app.profile = (await api.upgradeTalent(id)).profile;
    updateMenu();
    return app.profile.talents[id];
  }
  const lv = upgradeLocalTalent(app.progress, id);
  updateMenu();
  return lv;
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
  $('#shipName').textContent = `${s.name}${app.ship.key !== 'spark' ? ` · ${t('hud.level', { n: app.ship.level })}` : ''}`;
  $('#shipDesc').textContent = tx.shipDesc(app.ship.key);
  $('#shipYield').textContent = t('ship.yield', { m: shipYield(app.ship.key, app.ship.level).toFixed(2) });
  const p = app.profile;
  const pl = pilot();
  $('#menuCores').textContent = fmtNum(pl.cores);
  $('#shardChip').classList.toggle('hidden', !pl.online);
  $('#menuShards').textContent = fmtNum(p?.shards ?? 0);
  $('#talentDot').classList.toggle('hidden', !canUpgradeAny(pl.cores, pl.talents));
  if (app.balances) {
    $('#riftChip').classList.remove('hidden');
    $('#menuRift').textContent = fmtRift(app.balances.rift);
  }
  const wb = $('#walletBtn');
  const walletAddr = p?.wallet ?? (app.wallet?.connected ? app.wallet.address : null);
  // Sin token lanzado la wallet no sirve para nada: mejor no mostrar el botón.
  wb.classList.toggle('hidden', !app.config?.chain && !walletAddr);
  if (walletAddr) {
    wb.textContent = shortAddr(walletAddr);
    wb.classList.add('connected');
  } else {
    wb.textContent = app.config?.chain ? t('menu.connect') : t('menu.walletNoNet');
  }
  $('#streakTag').textContent = t('menu.streak', { n: pl.streak });
  const unit = pl.online ? '◆' : '✦';
  $('#missionList').replaceChildren(
    ...pl.missions.map((m) =>
      el('li', { class: m.done ? 'done' : '' }, [
        el('span', {}, `${m.done ? '✔ ' : ''}${tx.missionName(m.id, m.name)}`),
        el('b', {}, `+${m.reward} ${unit}`),
        el('div', { class: 'bar' }, [el('i', { style: `width:${Math.round((m.progress / m.goal) * 100)}%` })])
      ])
    )
  );
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
    toast(t('toast.noChain'), 'err');
    return false;
  }
  try {
    const address = await app.wallet.connect();
    if (app.config.staticMode) {
      app.balances = await app.wallet.balances();
      toast(t('toast.walletConnected', { a: shortAddr(address) }), 'ok');
      updateMenu();
      return true;
    }
    const { message } = await api.nonce(address);
    const signature = await app.wallet.signMessage(message);
    app.profile = await api.loginWallet(address, signature);
    app.balances = await app.wallet.balances();
    toast(t('toast.walletConnected', { a: shortAddr(address) }), 'ok');
    updateMenu();
    return true;
  } catch (err) {
    toast(explainError(err), 'err');
    return false;
  }
}

// --------------------------------------------------------------------- partida

let practiceNoticeShown = false;

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
    // Con servidor en línea, un error de la API es un aviso real (p. ej. arena sin inscripción).
    // Sin servidor (hosting estático) se juega en modo práctica.
    if (err.status && app.online) {
      toast(err.message, 'err');
      return;
    }
    game.offline = true;
    // En práctica puedes volar tu nave NFT (no hay recompensas que verificar).
    const own = app.config?.staticMode && app.wallet?.connected && app.ship.tokenId ? app.ship : { key: 'spark', level: 1 };
    run = { runId: null, seed: (Math.random() * 2 ** 32) >>> 0, ship: own.key, shipLevel: own.level, talents: app.progress.talents, mode: 'normal' };
    if (!practiceNoticeShown) {
      practiceNoticeShown = true;
      toast(t('toast.practice'));
    }
  }
  game.run = run;
  game.sim = createSim({ seed: run.seed, ship: run.ship, shipLevel: run.shipLevel, talents: run.talents });
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
  announce(run.mode === 'arena' ? t('ann.arena') : t('ann.survive'), run.mode === 'arena' ? t('ann.arenaSub') : t('ann.surviveSub'), 'good');
  showTutorial();
}

const TUTORIAL = [
  () => (matchMedia('(pointer: coarse)').matches ? t('tut.moveTouch') : t('tut.moveKeys')),
  () => t('tut.auto'),
  () => t('tut.gems'),
  () => t('tut.evo')
];
function showTutorial() {
  let seen = false;
  try {
    seen = localStorage.getItem('riftfall.tutorial') === '1';
    localStorage.setItem('riftfall.tutorial', '1');
  } catch {
    seen = false;
  }
  if (seen) return;
  const box = $('#tutorial');
  TUTORIAL.forEach((line, i) => {
    setTimeout(() => {
      if (game.mode !== 'play') return box.classList.add('hidden');
      box.innerHTML = line();
      box.classList.remove('hidden');
      box.style.animation = 'none';
      void box.offsetWidth;
      box.style.animation = '';
    }, 1800 + i * 4200);
  });
  setTimeout(() => box.classList.add('hidden'), 1800 + TUTORIAL.length * 4200);
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
    return { title: tx.weaponName(o.id), text: tx.weaponDesc(o.id, o.level), color: WEAPONS[o.id].color, icon: o.id, max: 5 };
  }
  if (o.kind === 'passive') {
    return { title: tx.passiveName(o.id), text: tx.passiveDesc(o.id), color: '#ffc94d', icon: o.id, max: PASSIVES[o.id].max };
  }
  if (o.kind === 'evolve') {
    const text = t('choice.evoText', { desc: tx.evoDesc(o.id), weapon: tx.weaponName(o.id) });
    return { title: tx.evoName(o.id), text, color: '#ffd23d', icon: o.id, max: 0, evo: true };
  }
  if (o.kind === 'repair') return { title: t('choice.repair'), text: t('choice.repairText'), color: '#4dff9a', icon: 'repair', max: 0 };
  return { title: t('choice.cache'), text: t('choice.cacheText'), color: '#ffc94d', icon: 'cache', max: 0 };
}

function openChoice() {
  const s = game.sim;
  game.choiceOpen = true;
  const chest = s.choiceSource === 'chest';
  $('.levelup-inner').classList.toggle('chest', chest);
  $('#levelupKicker').textContent = chest ? t('lvl.chestKicker') : t('lvl.kicker');
  $('#levelupTitle').textContent = chest ? t('lvl.chestTitle') : t('lvl.title', { n: s.player.level - s.pendingLevels + 1 });
  const box = $('#choices');
  box.replaceChildren(
    ...s.choice.map((o, i) => {
      const d = describeChoice(o);
      const card = el('button', { class: `choice${d.evo ? ' evo' : ''}`, style: `--accent:${d.color}` }, [
        d.evo
          ? el('span', { class: 'tag evo' }, t('lvl.evo'))
          : o.level === 1 && o.kind !== 'repair' && o.kind !== 'cache'
          ? el('span', { class: 'tag new' }, t('lvl.new'))
          : o.level
            ? el('span', { class: 'tag' }, t('hud.level', { n: o.level }))
            : null,
        iconCopy(d.icon, d.color, 128),
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

let lastResult = null;

async function showGameOver(local, victory) {
  const card = $('.gameover-card');
  card.classList.toggle('victory', victory);
  card.classList.toggle('defeat', !victory);
  const retreat = !victory && game.sim.phase !== 'dead';
  const title = victory ? t('go.titleVictory') : retreat ? t('go.titleRetreat') : t('go.titleDead');
  $('#goKicker').textContent = victory ? t('go.victory') : t('go.kicker');
  $('#goTitle').textContent = title;
  lastResult = { summary: local, shipKey: game.sim.shipKey, title };
  $('#goStats').replaceChildren(
    ...[
      [t('go.time'), fmtTime(local.timeSec)],
      [t('go.kills'), fmtNum(local.kills)],
      [t('go.combo'), `x${fmtNum(local.bestCombo ?? 0)}`],
      [t('go.score'), fmtNum(local.score)]
    ].map(([k, v]) => el('div', {}, [el('small', {}, k), el('b', {}, String(v))]))
  );
  const verify = $('#goVerify');
  const list = $('#goRewardList');
  list.replaceChildren();
  $('#goTotal').textContent = '…';
  $('#goUpgradeHint').classList.add('hidden');
  $('#hud').classList.add('hidden');
  $('#gameover').classList.remove('hidden');

  const showRows = (rows) =>
    rows.forEach(([label, v, unit = '◆'], i) => {
      const value = unit === '' ? v : `+${v} ${unit}`;
      list.append(el('li', { style: `animation-delay:${0.15 + i * 0.12}s` }, [el('span', {}, label), el('b', {}, value)]));
    });
  const afterRewards = () => {
    const pl = pilot();
    $('#goUpgradeHint').classList.toggle('hidden', !canUpgradeAny(pl.cores, pl.talents));
    updateMenu();
  };

  if (game.offline || !game.run?.runId) {
    // Práctica: el progreso (Núcleos, misiones y racha) se guarda en este dispositivo.
    verify.className = 'verify';
    verify.textContent = t('go.practice');
    $('#goTotalLabel').textContent = t('go.coresEarned');
    const res = recordLocalRun(app.progress, local);
    const rows = [[t('go.rowCores'), res.cores, '✦']];
    if (res.streak) rows.push([t('go.rowStreak'), res.streak, '✦']);
    for (const m of res.missions) rows.push([t('go.rowMission', { name: tx.missionName(m.id, m.name) }), m.reward, '✦']);
    if (res.newBest && app.progress.runs > 1) rows.push([t('go.newBest'), fmtNum(local.score), '']);
    showRows(rows);
    countUp($('#goTotal'), res.total);
    if (res.total > 0) setTimeout(() => audio.play('shard'), 400);
    afterRewards();
    return;
  }
  $('#goTotalLabel').textContent = t('go.shardsEarned');
  verify.className = 'verify';
  verify.replaceChildren(el('span', { class: 'spinner' }), t('go.verifying'));
  try {
    const res = await api.finishRun({ runId: game.run.runId, ...game.rec.finish() });
    verify.className = 'verify ok';
    verify.textContent = t('go.verified');
    const rows = [];
    if (game.run.mode === 'arena') rows.push([t('go.rowArena'), fmtNum(res.summary.score), '']);
    else {
      rows.push([t('go.rowRun', { m: res.summary.yieldMult.toFixed(2) }), res.rewards.run]);
      if (res.rewards.streak) rows.push([t('go.rowStreak'), res.rewards.streak]);
      for (const m of res.rewards.missions) rows.push([t('go.rowMission', { name: tx.missionName(m.id, m.name) }), m.reward]);
    }
    if (res.cores) rows.push([t('go.rowCores'), res.cores, '✦']);
    showRows(rows);
    countUp($('#goTotal'), res.totalShards);
    if (res.totalShards > 0) setTimeout(() => audio.play('shard'), 400);
    app.profile = res.profile;
    afterRewards();
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
    const name = w.evolved ? tx.evoName(w.id) : tx.weaponName(w.id);
    slots.push(
      el('div', { class: `slot${w.evolved ? ' evo' : ''}`, title: name }, [
        iconCopy(w.id, w.evolved ? '#ffd23d' : WEAPONS[w.id].color, 60),
        el('b', {}, w.evolved ? '★' : String(w.level))
      ])
    );
  }
  for (const p of s.player.passives) {
    slots.push(el('div', { class: 'slot passive', title: tx.passiveName(p.id) }, [iconCopy(p.id, '#ffc94d', 60), el('b', {}, String(p.level))]));
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
  setText('levelTag', t('hud.level', { n: p.level }));
  setText('hpText', `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`);
  setWidth('hpFill', (p.hp / p.stats.maxHp) * 100);
  setWidth('hpGhost', (p.hp / p.stats.maxHp) * 100);
  setText('timer', fmtTime(Math.floor(s.tick / 60)));
  setText('killCount', fmtNum(s.kills));
  setText('shardCount', fmtNum(s.shards));
  const boss = s.boss && !s.boss.dead ? s.boss : null;
  $('#bossBar').classList.toggle('hidden', !boss);
  if (boss) setWidth('bossFill', (boss.hp / boss.maxHp) * 100);
  const combo = $('#combo');
  if (s.combo >= 10) {
    combo.classList.remove('hidden');
    if (hudCache.combo !== s.combo) {
      hudCache.combo = s.combo;
      combo.firstChild.textContent = `x${s.combo}`;
      combo.classList.remove('bump');
      void combo.offsetWidth;
      combo.classList.add('bump');
    }
  } else if (!combo.classList.contains('hidden')) {
    combo.classList.add('hidden');
  }
  const sig = [...p.weapons.map((w) => w.id + w.level + (w.evolved ? '*' : '')), ...p.passives.map((x) => x.id + x.level)].join();
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
      if (ev.kind === 'boss') announce(t('ann.boss'), t('ann.bossSub'), 'danger');
      else announce(t('ann.swarm'), t('ann.swarmSub'), 'danger');
      break;
    case 'bossDead':
      announce(t('ann.bossDead'), t('ann.bossDeadSub'), 'good');
      break;
    case 'evolve':
      announce(tx.evoName(ev.id).toUpperCase(), t('ann.evolved'), 'good');
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
$('#goTalentsBtn').addEventListener('click', () => {
  backToMenu();
  panels.open('profile');
});
$('#shareBtn').addEventListener('click', async () => {
  if (!lastResult) return;
  const b = $('#shareBtn');
  b.disabled = true;
  try {
    await shareResult(lastResult);
  } finally {
    b.disabled = false;
  }
});
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
  if (app.wallet?.connected) panels.open(app.config?.staticMode ? 'hangar' : 'profile');
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
$('#controlsHint').textContent = matchMedia('(pointer: coarse)').matches ? t('menu.hintTouch') : t('menu.hintKeys');
const langSel = $('#langSel');
for (const [code, name] of Object.entries(LANGS)) langSel.append(el('option', { value: code, selected: code === lang }, name));
langSel.addEventListener('change', () => setLang(langSel.value));

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
      setNet(t('net.online', { net: app.config.chain.network, id: app.config.chain.chainId }), 'ok');
    } else {
      setNet(t('net.onlineNoChain'), 'warn');
    }
    if (app.ship.tokenId && !app.config.chain) selectShip({ key: 'spark', tokenId: null, level: 1 });
  } catch {
    // Sin servidor del juego: si junto al juego está publicada la configuración del token
    // (deployment.json, generada por el Lanzador), la tienda de naves, la forja y el mercado
    // funcionan igual directamente con la wallet.
    const dep = await fetch('/deployment.json')
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
      .catch(() => null);
    if (dep?.contracts?.RiftShips) {
      app.config = { chain: chainConfigFromDeployment(dep), staticMode: true, riftPerShard: 1, minClaimShards: 100, demoShips: false, missions: [] };
      brandText($('#menu'), app.config.chain.tokenSymbol);
      app.wallet = createWallet(app.config.chain);
      app.wallet.onChange(() => location.reload());
      setNet(t('net.shop'), 'warn');
    } else {
      setNet(t('net.practice'), 'warn');
    }
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
