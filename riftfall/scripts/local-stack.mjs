// Levanta todo RIFTFALL en local con un solo comando:
//   blockchain Hardhat (127.0.0.1:8545) + despliegue de contratos + servidor del juego.
// Uso: npm run build && npm run local   ->  http://localhost:8787
//
// Para jugar con wallet: en MetaMask añade la red "RIFTFALL Local" (el juego la propone sola)
// e importa la clave de prueba de la cuenta #3 de Hardhat, que recibe 250.000 RIFT:
//   0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
// (clave pública y conocida: úsala SOLO en local).

import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { JsonRpcProvider } from 'ethers';
import { createApp, ROOT } from '../server/app.mjs';

const env = process.env;
const RPC = 'http://127.0.0.1:8545';
const hardhat = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'hardhat.cmd' : 'hardhat');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true });
const alreadyUp = await provider.getBlockNumber().then(() => true, () => false);
let node = null;
if (alreadyUp) {
  console.log('Usando el nodo local que ya está corriendo en 8545');
} else {
  node = spawn(hardhat, ['node', '--hostname', '127.0.0.1', '--port', '8545'], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: process.platform === 'win32'
  });
  for (let i = 0; i < 80; i++) {
    if (await provider.getBlockNumber().then(() => true, () => false)) break;
    await sleep(500);
  }
}
console.log('Desplegando contratos…');
execFileSync(hardhat, ['run', 'scripts/deploy.cjs', '--network', 'localhost'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const app = await createApp({
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? '0.0.0.0',
  dataDir: env.DATA_DIR ?? path.join(ROOT, 'server', 'data', 'local'),
  staticDir: path.resolve(ROOT, env.STATIC_DIR ?? 'dist'),
  rpcUrl: RPC,
  deploymentFile: path.join(ROOT, 'deployments', '31337.json'),
  minClaimShards: Number(env.MIN_CLAIM_SHARDS ?? 20),
  minRealtimeRatio: Number(env.MIN_REALTIME_RATIO ?? 0.9),
  adminToken: env.ADMIN_TOKEN ?? 'local-admin',
  arenaAuto: true,
  arenaFee: 100,
  arenaHours: Number(env.ARENA_HOURS ?? 24)
});
const addr = await app.listen();
console.log(`\nRIFTFALL local listo en http://localhost:${addr.port}`);
console.log('Torneo de Arena automático creado. Admin token: local-admin');

const stop = async () => {
  await app.close();
  node?.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
