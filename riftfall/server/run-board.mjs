// Ranking compartido de las partidas normales (no solo del Desafío del Día): "Hoy" y "Histórico".
// Cada partida se vuelve a jugar acá con su nave, talentos, piezas y nivel del Rift, así que el
// puntaje que figura es el que realmente salió de esa partida (nunca el que manda el navegador).
// Todo vive en un solo archivo para gastar una sola escritura por partida que entra al ranking.

import { createHash } from 'node:crypto';
import { replayRun, SHIPS, RIFT_MAX, sanitizeTalents, sanitizeParts } from '../src/sim/index.js';
import { dailyNumber } from '../src/shared/daily.js';
import { cleanName } from '../src/shared/duel.js';
import { defaultName } from './world-board.mjs';

export const RUN_BOARD_SIZE = 50;

const publicId = (pid) => createHash('sha256').update(`riftfall-player|${pid}`).digest('hex').slice(0, 12);
const byRank = (a, b) => b.score - a.score || b.timeSec - a.timeSec || a.at - b.at;
const emptyBoard = (day) => ({ day, today: [], all: [], updatedAt: 0 });

/** Pone `entry` en la lista si mejora la fila del jugador o entra al top. Devuelve la lista nueva o null. */
function place(list, entry) {
  const mine = list.find((e) => e.id === entry.id);
  const last = list.length >= RUN_BOARD_SIZE ? list[list.length - 1] : null;
  const better = mine ? byRank(entry, mine) < 0 : !last || byRank(entry, last) < 0;
  const renamed = mine && !better && mine.name !== entry.name;
  if (!better && !renamed) return null;
  const rest = list.filter((e) => e.id !== entry.id);
  return [...rest, better ? entry : { ...mine, name: entry.name }].sort(byRank).slice(0, RUN_BOARD_SIZE);
}

const rankOf = (list, id) => {
  const i = list.findIndex((e) => e.id === id);
  return i >= 0 ? i + 1 : null;
};

/** `load(fresh)` devuelve el tablero (o null); `save(board)` lo guarda; `now()` da la hora. */
export function createRunBoard({ load, save, now = () => Date.now() }) {
  /** El tablero con "Hoy" vacío si ya cambió el día (UTC, igual que el Desafío). */
  const current = (b) => {
    const day = dailyNumber(now());
    if (!b) return emptyBoard(day);
    return b.day === day ? b : { ...b, day, today: [] };
  };

  return {
    async get() {
      return current(await load(false));
    },

    async submit(body) {
      const pid = String(body?.pid ?? '');
      if (!/^[a-f0-9]{16,64}$/.test(pid)) return { ok: false, error: 'player' };
      const seed = Number(body?.seed);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return { ok: false, error: 'seed' };
      const ship = String(body?.ship ?? '');
      if (!SHIPS[ship]) return { ok: false, error: 'ship' };
      const maxLevel = SHIPS[ship].levels?.length ?? 1;
      const shipLevel = Number(body?.shipLevel ?? 1);
      if (!Number.isInteger(shipLevel) || shipLevel < 1 || shipLevel > maxLevel) return { ok: false, error: 'ship' };
      const rift = Number(body?.rift ?? 0);
      if (!Number.isInteger(rift) || rift < 0 || rift > RIFT_MAX) return { ok: false, error: 'rift' };
      const talents = sanitizeTalents(body?.talents);
      const parts = sanitizeParts(body?.parts);
      const res = replayRun({ seed, ship, shipLevel, talents, rift, parts, inputs: body?.inputs, choices: body?.choices });
      if (!res.ok) return { ok: false, error: 'replay', detail: res.error };
      const s = res.summary;
      const entry = {
        id: publicId(pid),
        name: cleanName(body?.name) || defaultName(pid),
        score: s.score,
        timeSec: s.timeSec,
        kills: s.kills,
        victory: !!s.victory,
        ship,
        rift,
        at: now()
      };
      const board = current(await load(true));
      const today = place(board.today, entry);
      const all = place(board.all, entry);
      // Se escribe solo si cambia algo (cada escritura cuenta en el plan gratuito).
      if (today || all) {
        if (today) board.today = today;
        if (all) board.all = all;
        board.updatedAt = now();
        await save(board);
      }
      return {
        ok: true,
        score: entry.score,
        rankToday: rankOf(board.today, entry.id),
        rankAll: rankOf(board.all, entry.id),
        board
      };
    }
  };
}
