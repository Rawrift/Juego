import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/app.mjs';
import { playLocal } from '../helpers.mjs';

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
