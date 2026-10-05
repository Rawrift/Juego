// Progreso del piloto en modo práctica (sin servidor): Núcleos, talentos, misiones diarias, racha
// y estadísticas, guardados en este dispositivo. Usa las mismas reglas que el servidor.

import { TALENTS, TALENT_MAX, talentCost, sanitizeTalents, coresFromSummary, RIFT_MAX } from '../sim/index.js';
import { MISSIONS, freshDaily, applyRunToDaily, missionView, streakBonus } from '../shared/missions.js';

const KEY = 'riftfall.progress';

/** Día local (las misiones se reinician a la medianoche del jugador). */
function localDay(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function blank() {
  return {
    cores: 0,
    lifetimeCores: 0,
    talents: {},
    riftMax: 0,
    runs: 0,
    bestScore: 0,
    bestTime: 0,
    kills: 0,
    bosses: 0,
    victories: 0,
    streak: 0,
    lastDay: '',
    daily: freshDaily(localDay())
  };
}

export function loadProgress() {
  let p = blank();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') p = { ...p, ...raw };
  } catch {
    /* datos corruptos o modo privado: se empieza de cero */
  }
  p.talents = sanitizeTalents(p.talents);
  p.cores = Math.max(0, Math.floor(Number(p.cores) || 0));
  p.riftMax = Math.max(0, Math.min(RIFT_MAX, Math.floor(Number(p.riftMax) || 0)));
  rollDay(p);
  return p;
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* modo privado */
  }
}

function rollDay(p) {
  const today = localDay();
  if (p.daily?.day !== today) p.daily = freshDaily(today);
}

/** Aplica una partida de práctica terminada. Devuelve el detalle de lo ganado. */
export function recordLocalRun(p, sum) {
  rollDay(p);
  const out = { cores: coresFromSummary(sum), streak: 0, missions: [], newBest: sum.score > p.bestScore, riftUnlocked: null };
  // Ganar un nivel del Rift desbloquea el siguiente.
  if (sum.victory && (sum.rift ?? 0) >= p.riftMax && p.riftMax < RIFT_MAX) {
    p.riftMax = Math.min(RIFT_MAX, (sum.rift ?? 0) + 1);
    out.riftUnlocked = p.riftMax;
  }
  const today = localDay();
  if (p.lastDay !== today) {
    const yesterday = localDay(Date.now() - 86_400_000);
    p.streak = p.lastDay === yesterday ? p.streak + 1 : 1;
    p.lastDay = today;
    out.streak = streakBonus(p.streak);
  }
  for (const m of applyRunToDaily(p.daily, sum)) out.missions.push({ id: m.id, name: m.name, reward: m.reward });
  const total = out.cores + out.streak + out.missions.reduce((a, m) => a + m.reward, 0);
  out.total = total;
  p.cores += total;
  p.lifetimeCores = (p.lifetimeCores ?? 0) + total;
  p.runs++;
  p.kills += sum.kills;
  p.bosses += sum.bossesKilled;
  if (sum.victory) p.victories++;
  p.bestTime = Math.max(p.bestTime, sum.timeSec);
  p.bestScore = Math.max(p.bestScore, sum.score);
  saveProgress(p);
  return out;
}

/** Sube un talento un nivel si alcanzan los Núcleos. Devuelve el nivel nuevo o lanza un error. */
export function upgradeLocalTalent(p, id) {
  if (!TALENTS[id]) throw new Error('unknown');
  const next = (p.talents[id] ?? 0) + 1;
  if (next > TALENT_MAX) throw new Error('max');
  const cost = talentCost(next);
  if (p.cores < cost) throw new Error('poor');
  p.cores -= cost;
  p.talents = { ...p.talents, [id]: next };
  saveProgress(p);
  return next;
}

export function localMissions(p) {
  rollDay(p);
  return missionView(p.daily);
}

/** ¿Alcanza para mejorar algún talento? */
export function canUpgradeAny(cores, talents) {
  return Object.keys(TALENTS).some((id) => (talents[id] ?? 0) < TALENT_MAX && cores >= talentCost((talents[id] ?? 0) + 1));
}

export { MISSIONS };
