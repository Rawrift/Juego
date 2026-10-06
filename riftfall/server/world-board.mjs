// Ranking mundial del Desafío del Día. Cada partida se vuelve a jugar acá con las mismas reglas
// para todos (nunca se confía en el puntaje que manda el navegador) y se guarda el top del día.
// El almacenamiento es intercambiable: en Vercel es un archivo JSON por día en Vercel Blob
// (api/daily.js); en los tests, un objeto en memoria.

import { replayRun } from '../src/sim/index.js';
import { dailyNumber, dailySeed, DAILY_RULES } from '../src/shared/daily.js';
import { cleanName } from '../src/shared/duel.js';
import { publicId } from '../src/shared/public-id.js';

export const BOARD_SIZE = 50;

const emptyBoard = (n) => ({ n, entries: [], updatedAt: 0 });
/** Identificador público del jugador: un resumen de su id secreto (no se puede usar para hacerse pasar por él). */
const byRank = (a, b) => b.score - a.score || b.timeSec - a.timeSec || a.at - b.at;

/** Nombre por defecto a partir del id del jugador. */
export function defaultName(pid) {
  return `Piloto ${String(pid).slice(0, 4).toUpperCase()}`;
}

/**
 * `load(n, fresh)` devuelve el tablero del día `n` (o null si no existe); `fresh` pide saltear cachés.
 * `save(n, board)` lo guarda. `now()` da la hora (para los tests).
 */
export function createDailyBoard({ load, save, now = () => Date.now(), verify = replayRun }) {
  return {
    async get(n) {
      const day = Number(n);
      if (!Number.isInteger(day) || day < 1) return null;
      return (await load(day, false)) ?? emptyBoard(day);
    },

    async submit(body) {
      const n = Number(body?.n);
      const today = dailyNumber(now());
      // Se acepta el día de hoy y el anterior (una partida puede terminar después de medianoche UTC).
      if (!Number.isInteger(n) || n < today - 1 || n > today) return { ok: false, error: 'day' };
      const pid = String(body?.pid ?? '');
      if (!/^[a-f0-9]{16,64}$/.test(pid)) return { ok: false, error: 'player' };
      const res = await verify({
        seed: dailySeed(n),
        ship: DAILY_RULES.ship,
        shipLevel: DAILY_RULES.shipLevel,
        talents: {},
        rift: DAILY_RULES.rift,
        parts: null,
        inputs: body?.inputs,
        choices: body?.choices,
        claimed: body?.summary
      });
      if (!res.ok) return { ok: false, error: 'replay', detail: res.error };
      const s = res.summary;
      const entry = {
        id: publicId(pid),
        name: cleanName(body?.name) || defaultName(pid),
        score: s.score,
        timeSec: s.timeSec,
        kills: s.kills,
        victory: !!s.victory,
        at: now()
      };
      const board = (await load(n, true)) ?? emptyBoard(n);
      const mine = board.entries.find((e) => e.id === entry.id);
      const last = board.entries.length >= BOARD_SIZE ? board.entries[board.entries.length - 1] : null;
      const better = mine ? byRank(entry, mine) < 0 : !last || byRank(entry, last) < 0;
      // Se escribe solo si cambia algo (cada escritura cuenta en el plan gratuito).
      const renamed = mine && !better && mine.name !== entry.name;
      if (better || renamed) {
        const rest = board.entries.filter((e) => e.id !== entry.id);
        const kept = better ? entry : { ...mine, name: entry.name };
        board.entries = [...rest, kept].sort(byRank).slice(0, BOARD_SIZE);
        board.updatedAt = now();
        await save(n, board);
      }
      const rankIdx = board.entries.findIndex((e) => e.id === entry.id);
      return {
        ok: true,
        score: entry.score,
        rank: rankIdx >= 0 ? rankIdx + 1 : null,
        best: rankIdx >= 0 ? board.entries[rankIdx].score : null,
        cutoff: board.entries.length >= BOARD_SIZE ? board.entries[board.entries.length - 1].score : 0,
        board
      };
    }
  };
}
