// Persistencia simple en un archivo JSON con escritura atómica.
// Suficiente para el lanzamiento y para cientos de jugadores concurrentes; para escalar,
// migrar estas mismas colecciones a Postgres/Supabase (ver docs/ECONOMIA.md, "Operación").

import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({
  version: 1,
  players: {},
  wallets: {},
  sessions: {},
  runs: {},
  claims: {},
  tournaments: {},
  leaderboard: { day: '', daily: {}, allTime: {} },
  stats: { totalRuns: 0, verifiedRuns: 0, rejectedRuns: 0, shardsIssued: 0, shardsClaimed: 0 }
});

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let data = EMPTY();
  if (fs.existsSync(file)) {
    data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  }
  let timer = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };

  return {
    data,
    save() {
      if (!timer) timer = setTimeout(flush, 1500);
    },
    flush
  };
}
