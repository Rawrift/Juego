import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.mjs';
import { playLocal } from '../helpers.mjs';
import { coresFromSummary } from '../../src/sim/index.js';

async function boot(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'riftfall-'));
  const app = await createApp({ dataDir, staticDir: path.join(dataDir, 'none'), replayWorkers: 1, ...opts });
  const { port } = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, url, body, token) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, json: await res.json() };
  };
  return { app, call };
}

test('flujo invitado: partida verificada por replay, recompensas, misiones y ranking', async () => {
  const { app, call } = await boot({ minRealtimeRatio: 0 });
  try {
    const g = await call('POST', '/api/auth/guest');
    assert.equal(g.status, 200);
    const token = g.json.token;

    const start = await call('POST', '/api/run/start', { mode: 'normal' }, token);
    assert.equal(start.status, 200);
    assert.equal(start.json.ship, 'spark');

    const local = playLocal(start.json.seed, 'spark', 1, 60 * 200);
    const fin = await call('POST', '/api/run/finish', { runId: start.json.runId, inputs: local.inputs, choices: local.choices }, token);
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    assert.deepEqual(fin.json.summary, local.summary);
    assert.equal(fin.json.rewards.run, local.summary.shardsEarned);
    assert.equal(fin.json.rewards.streak, 10);
    assert.equal(fin.json.profile.shards, fin.json.totalShards);
    assert.equal(fin.json.profile.missions.find((m) => m.id === 'runs3').progress, 1);

    const again = await call('POST', '/api/run/finish', { runId: start.json.runId, inputs: local.inputs, choices: local.choices }, token);
    assert.equal(again.status, 400, 'no se puede cobrar dos veces la misma partida');

    const lb = await call('GET', '/api/leaderboard?scope=daily');
    assert.equal(lb.json.entries.length, 1);
    assert.equal(lb.json.entries[0].score, local.summary.score);

    const rep = await call('GET', `/api/replay?id=${start.json.runId}`);
    assert.equal(rep.json.seed, start.json.seed);

    const claim = await call('POST', '/api/claim', { shards: 100 }, token);
    assert.equal(claim.status, 400, 'sin blockchain no hay canje');
  } finally {
    await app.close();
  }
});

test('rechaza entradas manipuladas y partidas aceleradas (speed-hack)', async () => {
  const { app, call } = await boot({ minRealtimeRatio: 0.9 });
  try {
    const { token } = (await call('POST', '/api/auth/guest')).json;
    const s1 = (await call('POST', '/api/run/start', {}, token)).json;
    const local = playLocal(s1.seed, 'spark', 1, 60 * 60);
    const fast = await call('POST', '/api/run/finish', { runId: s1.runId, inputs: local.inputs, choices: local.choices }, token);
    assert.equal(fast.status, 400);
    assert.match(fast.json.error, /duración real/);

    const s2 = (await call('POST', '/api/run/start', {}, token)).json;
    const forged = await call('POST', '/api/run/finish', { runId: s2.runId, inputs: [1, 10, 77, 5], choices: [] }, token);
    assert.equal(forged.status, 400);
    assert.match(forged.json.error, /rechazada/);

    const s3 = (await call('POST', '/api/run/start', {}, token)).json;
    const nft = await call('POST', '/api/run/start', { shipTokenId: 1 }, token);
    assert.equal(nft.status, 400, 'sin blockchain no se pueden usar naves NFT');
    assert.ok(s3.runId);

    const prof = (await call('GET', '/api/profile', null, token)).json.profile;
    assert.equal(prof.shards, 0);
  } finally {
    await app.close();
  }
});

test('valida nombre de piloto y sesiones', async () => {
  const { app, call } = await boot();
  try {
    assert.equal((await call('GET', '/api/profile', null, 'nope')).status, 401);
    const { token } = (await call('POST', '/api/auth/guest')).json;
    assert.equal((await call('POST', '/api/profile/name', { name: '<script>' }, token)).status, 400);
    const ok = await call('POST', '/api/profile/name', { name: 'Nova Ace' }, token);
    assert.equal(ok.json.profile.name, 'Nova Ace');
  } finally {
    await app.close();
  }
});

test('talentos: se compran con Núcleos, se aplican en el replay y no en la Arena', async () => {
  const { app, call } = await boot({ minRealtimeRatio: 0 });
  try {
    const g = (await call('POST', '/api/auth/guest')).json;
    const token = g.token;
    assert.equal(g.profile.cores, 0);
    assert.deepEqual(g.profile.talents, {});

    const s1 = (await call('POST', '/api/run/start', {}, token)).json;
    assert.deepEqual(s1.talents, {});
    const run1 = playLocal(s1.seed, 'spark', 1, 60 * 120);
    const f1 = (await call('POST', '/api/run/finish', { runId: s1.runId, inputs: run1.inputs, choices: run1.choices }, token)).json;
    assert.equal(f1.cores, coresFromSummary(run1.summary));
    assert.equal(f1.profile.cores, f1.cores);

    // Sin Núcleos suficientes no se puede comprar.
    app.db.data.players[g.profile.id].cores = 39;
    const poor = await call('POST', '/api/talents/upgrade', { id: 'hull' }, token);
    assert.equal(poor.status, 400);
    assert.match(poor.json.error, /Núcleos/);
    assert.equal((await call('POST', '/api/talents/upgrade', { id: 'nope' }, token)).status, 400);

    app.db.data.players[g.profile.id].cores = 1000;
    const up1 = (await call('POST', '/api/talents/upgrade', { id: 'hull' }, token)).json;
    const up2 = (await call('POST', '/api/talents/upgrade', { id: 'hull' }, token)).json;
    assert.deepEqual(up2.profile.talents, { hull: 2 });
    assert.equal(up1.profile.cores, 960);
    assert.equal(up2.profile.cores, 870);

    // La partida siguiente usa los talentos del servidor y el replay los respeta.
    const s2 = (await call('POST', '/api/run/start', {}, token)).json;
    assert.deepEqual(s2.talents, { hull: 2 });
    const run2 = playLocal(s2.seed, 'spark', 1, 60 * 60, s2.talents);
    const f2 = await call('POST', '/api/run/finish', { runId: s2.runId, inputs: run2.inputs, choices: run2.choices }, token);
    assert.equal(f2.status, 200, JSON.stringify(f2.json));
    assert.deepEqual(f2.json.summary, run2.summary);
    const rep = (await call('GET', `/api/replay?id=${s2.runId}`)).json;
    assert.deepEqual(rep.talents, { hull: 2 });

    for (let i = 0; i < 3; i++) await call('POST', '/api/talents/upgrade', { id: 'hull' }, token);
    const maxed = await call('POST', '/api/talents/upgrade', { id: 'hull' }, token);
    assert.equal(maxed.status, 400, 'nivel máximo 5');
    assert.equal((await call('GET', '/api/profile', null, token)).json.profile.talents.hull, 5);
  } finally {
    await app.close();
  }
});
