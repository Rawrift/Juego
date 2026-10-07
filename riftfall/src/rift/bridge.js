// Ruta Rift: los dos juegos se alimentan entre sí. Jugar RIFTFALL da créditos en Rift Cargo y crecer
// en Rift Cargo da Núcleos en RIFTFALL. Los dos juegos están en el mismo sitio, así que cada uno lee
// el progreso del otro de la memoria del navegador (y de la Cuenta Rift, que la sincroniza).
// Cada premio se cobra una sola vez: se guarda cuántos escalones ya se cobraron.

/** Escalones: qué hay que lograr en RIFTFALL y cuántos créditos da en Rift Cargo. */
export const TO_CARGO = [
  { need: (p) => (p?.runs ?? 0) >= 1, credits: 2500, key: 'run' },
  { need: (p) => (p?.riftMax ?? 0) >= 1, credits: 10000, key: 'rift' },
  { need: (p) => (p?.victories ?? 0) >= 1, credits: 25000, key: 'win' }
];

/** Escalones: qué nivel de Rift Cargo hay que alcanzar y cuántos Núcleos da en RIFTFALL. */
export const TO_RIFTFALL = [
  { need: (c) => (c?.level ?? 0) >= 3, cores: 300, key: 'lv3', level: 3 },
  { need: (c) => (c?.level ?? 0) >= 6, cores: 800, key: 'lv6', level: 6 },
  { need: (c) => (c?.level ?? 0) >= 9, cores: 1500, key: 'lv9', level: 9 }
];

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
export const riftfallProgress = () => readJson('riftfall.progress');
export const cargoState = () => readJson('riftcargo.save')?.state ?? null;

/**
 * Premios pendientes (en orden). `claimed` = cuántos escalones ya se cobraron; `other` = progreso del
 * otro juego. Devuelve los escalones nuevos que ya se cumplen (se cobran de a uno, en orden).
 */
export function pending(steps, claimed, other) {
  const out = [];
  for (let i = Math.max(0, claimed | 0); i < steps.length; i++) {
    if (!steps[i].need(other)) break;
    out.push({ ...steps[i], index: i });
  }
  return out;
}

/** El próximo escalón que falta (para invitar a jugar el otro juego), o null. */
export const nextStep = (steps, claimed) => steps[Math.max(0, claimed | 0)] ?? null;
