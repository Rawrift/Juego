// Integración completa contra un nodo Hardhat local:
// login con wallet -> compra de nave NFT -> partida verificada con esa nave -> canje de Shards
// por RIFT con vale EIP-712 -> torneo de Arena con inscripción, ranking y liquidación on-chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { JsonRpcProvider, Wallet, Contract, parseEther, formatEther } from 'ethers';
import { createApp, ROOT } from '../../server/app.mjs';
import { SHIPS_ABI, TOKEN_ABI, VAULT_ABI, ARENA_ABI } from '../../src/shared/abis.js';
import { playLocal } from '../helpers.mjs';

const RPC = 'http://127.0.0.1:8545';
const TESTER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'; // cuenta #3 de Hardhat
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('flujo on-chain completo', { timeout: 240_000 }, async () => {
  const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true, cacheTimeout: -1 });
  const busy = await provider.getBlockNumber().then(() => true, () => false);
  assert.equal(busy, false, 'El puerto 8545 está ocupado: detén otros nodos locales antes de este test');
  const hardhatBin = path.join(ROOT, 'node_modules', '.bin', 'hardhat');
  const node = spawn(hardhatBin, ['node', '--hostname', '127.0.0.1', '--port', '8545'], { cwd: ROOT, stdio: 'ignore' });
  let app;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await provider.getBlockNumber();
        break;
      } catch {
        await sleep(500);
      }
    }
    execFileSync(hardhatBin, ['run', 'scripts/deploy.cjs', '--network', 'localhost'], { cwd: ROOT, stdio: 'ignore' });
    const deploymentFile = path.join(ROOT, 'deployments', '31337.json');
    const dep = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));

    app = await createApp({
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'riftfall-chain-')),
      staticDir: '/nonexistent',
      rpcUrl: RPC,
      deploymentFile,
      minRealtimeRatio: 0,
      minClaimShards: 10,
      adminToken: 'test-admin',
      replayWorkers: 1
    });
    assert.ok(app.chain, 'la blockchain debe quedar conectada');
    const { port } = await app.listen(0, '127.0.0.1');
    const call = async (method, url, body, token, extra = {}) => {
      const res = await fetch(`http://127.0.0.1:${port}${url}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: res.status, json: await res.json() };
    };

    // 1. Login: el invitado vincula su wallet firmando un mensaje (sin gas).
    const wallet = new Wallet(TESTER_KEY, provider);
    const guest = (await call('POST', '/api/auth/guest')).json.token;
    const { message } = (await call('POST', '/api/auth/nonce', { address: wallet.address })).json;
    const login = await call('POST', '/api/auth/wallet', { address: wallet.address, signature: await wallet.signMessage(message) }, guest);
    assert.equal(login.status, 200, JSON.stringify(login.json));
    assert.equal(login.json.profile.wallet, wallet.address);
    const token = login.json.token;

    // 2. Compra de una nave TEMPEST en ETH.
    const ships = new Contract(dep.contracts.RiftShips, SHIPS_ABI, wallet);
    await (await ships.mint(2, { value: parseEther('0.025') })).wait();
    const owned = (await call('GET', '/api/ships', null, token)).json.ships;
    assert.deepEqual(owned.map((s) => [s.key, s.level]), [['tempest', 1]]);

    // 3. Partida con la nave NFT, verificada por replay en el servidor.
    const start = (await call('POST', '/api/run/start', { shipTokenId: owned[0].tokenId }, token)).json;
    assert.equal(start.ship, 'tempest');
    const local = playLocal(start.seed, 'tempest', 1, 60 * 150);
    const fin = await call('POST', '/api/run/finish', { runId: start.runId, inputs: local.inputs, choices: local.choices }, token);
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    assert.equal(fin.json.summary.yieldMult, 1.3);
    const shards = fin.json.profile.shards;
    assert.ok(shards >= 10, `shards=${shards}`);

    // 4. Canje: el servidor firma un vale y el jugador lo cobra en el RewardVault.
    const claim = await call('POST', '/api/claim', { shards }, token);
    assert.equal(claim.status, 200, JSON.stringify(claim.json));
    const c = claim.json.claim;
    const vault = new Contract(dep.contracts.RewardVault, VAULT_ABI, wallet);
    const rift = new Contract(dep.contracts.RiftToken, TOKEN_ABI, wallet);
    const before = await rift.balanceOf(wallet.address);
    await (await vault.claim(BigInt(c.amountWei), BigInt(c.id), c.deadline, c.signature)).wait();
    assert.equal(await rift.balanceOf(wallet.address), before + parseEther(String(shards)));
    const prof = (await call('GET', '/api/profile', null, token)).json.profile;
    assert.equal(prof.claims[0].status, 'paid');
    assert.equal(prof.shards, 0);

    // 5. Arena: torneo corto, inscripción on-chain, partida y liquidación del bote.
    const created = await call('POST', '/api/admin/arena/create', { entryFee: 100, hours: 0.006 }, null, { 'x-admin-token': 'test-admin' });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const tid = created.json.tournament.id;
    const arena = new Contract(dep.contracts.RiftArena, ARENA_ABI, wallet);
    await (await rift.approve(dep.contracts.RiftArena, parseEther('100'))).wait();
    await (await arena.enter(BigInt(tid))).wait();
    const astart = await call('POST', '/api/run/start', { mode: 'arena' }, token);
    assert.equal(astart.status, 200, JSON.stringify(astart.json));
    assert.equal(astart.json.ship, 'spark', 'la Arena es justa: todos con la nave base');
    const alocal = playLocal(astart.json.seed, 'spark', 1, 60 * 20);
    const afin = await call('POST', '/api/run/finish', { runId: astart.json.runId, inputs: alocal.inputs, choices: alocal.choices }, token);
    assert.equal(afin.status, 200);
    assert.equal(afin.json.totalShards, 0, 'la Arena no emite Shards');
    const board = (await call('GET', '/api/arena')).json.tournaments[0];
    assert.equal(board.ranking[0].score, alocal.summary.score);
    assert.equal(board.onchain.entrants, 1);

    // Esperar a que la cadena supere el fin del torneo.
    while ((await provider.getBlock('latest')).timestamp <= created.json.tournament.endsAt) {
      await sleep(1000);
      await provider.send('evm_mine', []);
    }
    const balBefore = await rift.balanceOf(wallet.address);
    const settled = await call('POST', '/api/admin/arena/settle', { id: tid }, null, { 'x-admin-token': 'test-admin' });
    assert.equal(settled.status, 200, JSON.stringify(settled.json));
    // bote 100 - 10% rake - 5% quema = 85; el 1º se lleva el 30% = 25.5; el resto vuelve al pool
    assert.equal(formatEther((await rift.balanceOf(wallet.address)) - balBefore), '25.5');
  } finally {
    if (app) await app.close();
    node.kill('SIGTERM');
  }
});
