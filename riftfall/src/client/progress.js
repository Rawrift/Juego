// Progreso del piloto en modo práctica (sin servidor): Núcleos, talentos, misiones diarias, racha
// y estadísticas, guardados en este dispositivo. Usa las mismas reglas que el servidor.

import {
  TALENTS,
  TALENT_MAX,
  talentCost,
  sanitizeTalents,
  coresFromSummary,
  RIFT_MAX,
  PART_SLOTS,
  CRATE_COST,
  sanitizeInventory,
  equippedParts,
  openCrates,
  cratesFromSummary,
  ALL_PARTS,
  PART_MAX
} from '../sim/index.js';
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
    parts: {},
    loadout: {},
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
  p.parts = sanitizeInventory(p.parts);
  p.loadout = Object.fromEntries(Object.entries(equippedParts(p.loadout, p.parts)).map(([k, v]) => [k, v.id]));
  rollDay(p);
  return p;
}

export function saveProgress(p) {
  p.updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* modo privado */
  }
  // Avisa que cambió (la Cuenta Rift lo sube a la nube unos segundos después).
  if (typeof dispatchEvent === 'function') dispatchEvent(new Event('riftfall:progress'));
}

const isBlank = (p) => !p || (!(p.runs > 0) && !(p.lifetimeCores > 0) && !(p.cores > 0));
const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = Math.max(Number(out[k]) || 0, Number(v) || 0);
  return out;
};

/**
 * Une dos progresos del mismo jugador (por ejemplo, el de Chrome y el del navegador de MetaMask)
 * sin perder nada: los récords y lo desbloqueado quedan en lo mejor de ambos; lo que se gasta
 * (Núcleos) y la pieza equipada vienen del que se usó último.
 */
export function mergeProgress(a, b) {
  if (isBlank(a)) return b ? { ...b } : a;
  if (isBlank(b)) return { ...a };
  const newer = (Number(b.updatedAt) || 0) > (Number(a.updatedAt) || 0) ? b : a;
  const older = newer === a ? b : a;
  const out = { ...older, ...newer };
  for (const k of ['runs', 'bestScore', 'bestTime', 'kills', 'bosses', 'victories', 'lifetimeCores', 'riftMax', 'bridge']) {
    out[k] = Math.max(Number(a[k]) || 0, Number(b[k]) || 0);
  }
  out.talents = maxMap(a.talents, b.talents);
  out.parts = maxMap(a.parts, b.parts);
  // La racha y las misiones del día más reciente.
  const later = (a.lastDay ?? '') >= (b.lastDay ?? '') ? a : b;
  out.lastDay = later.lastDay;
  out.streak = later.streak;
  if (a.daily?.day && b.daily?.day) out.daily = a.daily.day >= b.daily.day ? a.daily : b.daily;
  // El mejor Desafío del Día de cada día.
  const ca = a.challenge;
  const cb = b.challenge;
  if (ca && cb && ca.n === cb.n) {
    const best = !ca.best ? cb.best : !cb.best ? ca.best : cb.best.score > ca.best.score ? cb.best : ca.best;
    out.challenge = { n: ca.n, best, tries: Math.max(ca.tries ?? 0, cb.tries ?? 0) };
  } else if (ca || cb) out.challenge = (ca?.n ?? -1) > (cb?.n ?? -1) ? ca : cb;
  out.updatedAt = Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0);
  return out;
}

function rollDay(p) {
  const today = localDay();
  if (p.daily?.day !== today) p.daily = freshDaily(today);
}

/** Aplica una partida de práctica terminada. Devuelve el detalle de lo ganado. */
export function recordLocalRun(p, sum, { daily = false } = {}) {
  rollDay(p);
  const out = { cores: coresFromSummary(sum), streak: 0, missions: [], newBest: sum.score > p.bestScore, riftUnlocked: null };
  // Ganar un nivel del Rift desbloquea el siguiente.
  if (!daily && sum.victory && (sum.rift ?? 0) >= p.riftMax && p.riftMax < RIFT_MAX) {
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
  // Cajas de piezas: una por Guardián y otra por ganar (en el desafío no hay).
  out.crates = daily ? [] : openCrates(p.parts, cratesFromSummary(sum), Math.random);
  out.cores += out.crates.reduce((a, c) => a + c.refund, 0);
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

/** Guarda el resultado de un Desafío del Día. Devuelve { best, newBest, tries }. */
export function recordChallenge(p, n, sum) {
  if (p.challenge?.n !== n) p.challenge = { n, best: null, tries: 0 };
  const ch = p.challenge;
  ch.tries++;
  const newBest = !ch.best || sum.score > ch.best.score;
  if (newBest) ch.best = { score: sum.score, timeSec: sum.timeSec, kills: sum.kills, victory: sum.victory };
  saveProgress(p);
  return { best: ch.best, newBest, tries: ch.tries };
}

/** Equipa (o quita, con id = null) una pieza en un hueco. */
export function equipLocalPart(p, slot, id) {
  if (!PART_SLOTS.includes(slot)) throw new Error('slot');
  if (id && (!id.startsWith(`${slot}:`) || !p.parts[id])) throw new Error('missing');
  if (id) p.loadout = { ...p.loadout, [slot]: id };
  else {
    const { [slot]: _gone, ...rest } = p.loadout;
    p.loadout = rest;
  }
  saveProgress(p);
}

/** Compra y abre una caja de piezas con Núcleos. Devuelve lo obtenido. */
export function buyLocalCrate(p) {
  if (p.cores < CRATE_COST) throw new Error('poor');
  p.cores -= CRATE_COST;
  const got = openCrates(p.parts, 1, Math.random);
  p.cores += got.reduce((a, c) => a + c.refund, 0);
  saveProgress(p);
  return got;
}

/** Herramientas del Panel del dueño: Núcleos, talentos, niveles del Rift y piezas al máximo. */
export const OWNER_CORES = 5000;
export function ownerBoost(p, kind) {
  if (kind === 'cores') p.cores += OWNER_CORES;
  else if (kind === 'talents') p.talents = Object.fromEntries(Object.keys(TALENTS).map((id) => [id, TALENT_MAX]));
  else if (kind === 'rift') p.riftMax = RIFT_MAX;
  else if (kind === 'parts') p.parts = Object.fromEntries(ALL_PARTS.map((id) => [id, PART_MAX]));
  else throw new Error('unknown');
  saveProgress(p);
  return p;
}
