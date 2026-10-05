// Desafío del Día: la misma partida para todo el mundo (misma semilla, misma nave, sin
// habilidades), estilo Wordle. Los días son UTC para que en todos los países sea el mismo.

import { seedFromString } from '../sim/rng.js';

/** 1 de octubre de 2026 = Desafío #1. */
export const DAILY_EPOCH = Date.UTC(2026, 9, 1);
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
