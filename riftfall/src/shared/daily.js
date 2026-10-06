// Desafío del Día: la misma partida para todo el mundo (misma semilla, misma nave, sin
// habilidades), estilo Wordle. El día cambia a la vez en todo el mundo: a la medianoche de
// Argentina (UTC-3, sin horario de verano), que es de donde es la mayoría de los jugadores.
// También marca cuándo arranca el ranking de "Hoy".

import { seedFromString } from '../sim/rng.js';

/** 1 de octubre de 2026, 00:00 en Argentina (03:00 UTC) = Desafío #1. */
export const DAILY_EPOCH = Date.UTC(2026, 9, 1, 3);
const DAY = 86_400_000;

/** Reglas iguales para todos. */
export const DAILY_RULES = { ship: 'spark', shipLevel: 1, rift: 1 };

export function dailyNumber(ts = Date.now()) {
  return Math.floor((ts - DAILY_EPOCH) / DAY) + 1;
}

export function dailySeed(n) {
  return seedFromString(`riftfall-daily-${n}`);
}

/** Milisegundos hasta el próximo desafío. */
export function msToNextDaily(ts = Date.now()) {
  return DAY - ((((ts - DAILY_EPOCH) % DAY) + DAY) % DAY);
}
