// Auditoría del ranking: vuelve a jugar las partidas que el servidor aceptó con el control rápido
// (el plan gratis de Cloudflare no tiene tiempo de procesador para re-jugarlas al recibirlas) y saca
// del ranking las que no dan el puntaje que dijeron.
//
// Uso: AUDIT_TOKEN=... node scripts/audit-runs.mjs https://riftfall.pages.dev
// (la misma clave AUDIT_TOKEN tiene que estar en las variables del proyecto de Cloudflare)

import { replayRun } from '../src/sim/index.js';
import { dailySeed, DAILY_RULES } from '../src/shared/daily.js';

const site = (process.argv[2] ?? '').replace(/\/+$/, '');
const token = process.env.AUDIT_TOKEN;
if (!site || !token) {
  console.error('Uso: AUDIT_TOKEN=... node scripts/audit-runs.mjs https://tu-sitio');
  process.exit(1);
}
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

let checked = 0;
let bad = 0;
for (;;) {
  const res = await fetch(`${site}/api/rift/audit?limit=20`, { headers });
  if (!res.ok) throw new Error(`auditoría: HTTP ${res.status}`);
  const { runs } = await res.json();
  if (!runs.length) break;
  for (const r of runs) {
    const b = r.body;
    const daily = r.board.startsWith('daily:');
    const out = replayRun(daily
      ? { seed: dailySeed(Number(r.board.slice(6))), ship: DAILY_RULES.ship, shipLevel: DAILY_RULES.shipLevel, talents: {}, rift: DAILY_RULES.rift, parts: null, inputs: b.inputs, choices: b.choices }
      : { seed: b.seed, ship: b.ship, shipLevel: b.shipLevel, talents: b.talents, rift: b.rift, parts: b.parts, inputs: b.inputs, choices: b.choices });
    const ok = out.ok && out.summary.score === r.claimed.score && out.summary.timeSec === r.claimed.timeSec;
    await fetch(`${site}/api/rift/audit`, { method: 'POST', headers, body: JSON.stringify({ id: r.id, ok, board: r.board, pid: r.player_pid, claimed: r.claimed }) });
    checked++;
    if (!ok) {
      bad++;
      console.log(`✗ partida ${r.id} (${r.board}): dijo ${r.claimed.score}, dio ${out.summary?.score ?? out.error}`);
    }
  }
}
console.log(`Auditadas ${checked} partidas, ${bad} falsas sacadas del ranking.`);
