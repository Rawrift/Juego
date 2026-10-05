// Reglas de economía off-chain: misiones diarias, racha de días y recompensas.

export const MISSIONS = [
  { id: 'runs3', name: 'Juega 3 partidas', goal: 3, metric: 'runs', reward: 30 },
  { id: 'kills500', name: 'Elimina 500 enemigos', goal: 500, metric: 'kills', reward: 40 },
  { id: 'survive5', name: 'Sobrevive 5:00 en una partida', goal: 300, metric: 'bestTime', reward: 60 },
  { id: 'boss1', name: 'Derrota a un Guardián del Rift', goal: 1, metric: 'bosses', reward: 80 },
  { id: 'combo200', name: 'Haz un combo de 200', goal: 200, metric: 'bestCombo', reward: 50 }
];

export function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function previousDayKey(ts = Date.now()) {
  return dayKey(ts - 86_400_000);
}

export function streakBonus(streak) {
  return 10 * Math.min(streak, 7);
}

export function freshDaily(day) {
  return { day, runs: 0, kills: 0, bestTime: 0, bosses: 0, bestCombo: 0, done: [] };
}

/** Actualiza progreso diario con una partida verificada. Devuelve misiones completadas ahora. */
export function applyRunToDaily(daily, summary) {
  daily.runs += 1;
  daily.kills += summary.kills;
  daily.bosses += summary.bossesKilled;
  daily.bestTime = Math.max(daily.bestTime, summary.timeSec);
  daily.bestCombo = Math.max(daily.bestCombo ?? 0, summary.bestCombo ?? 0);
  const completed = [];
  for (const m of MISSIONS) {
    if (daily.done.includes(m.id)) continue;
    if (daily[m.metric] >= m.goal) {
      daily.done.push(m.id);
      completed.push(m);
    }
  }
  return completed;
}

export function missionView(daily) {
  return MISSIONS.map((m) => ({
    id: m.id,
    name: m.name,
    goal: m.goal,
    reward: m.reward,
    progress: Math.min(m.goal, daily[m.metric] ?? 0),
    done: daily.done.includes(m.id)
  }));
}
