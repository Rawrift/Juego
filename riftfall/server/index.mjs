// Arranque del servidor. Configuración por variables de entorno (ver README.md).
import fs from 'node:fs';
import path from 'node:path';
import { createApp, ROOT } from './app.mjs';

const env = process.env;
const localDeployment = path.join(ROOT, 'deployments', '31337.json');
const deploymentFile = env.DEPLOYMENT_FILE ?? (fs.existsSync(localDeployment) ? localDeployment : '');

const app = await createApp({
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? '0.0.0.0',
  dataDir: env.DATA_DIR ?? path.join(ROOT, 'server', 'data'),
  staticDir: path.resolve(ROOT, env.STATIC_DIR ?? 'dist'),
  rpcUrl: env.RPC_URL ?? (deploymentFile === localDeployment ? 'http://127.0.0.1:8545' : ''),
  publicRpcUrl: env.PUBLIC_RPC_URL ?? '',
  explorerUrl: env.EXPLORER_URL ?? '',
  deploymentFile,
  signerKey: env.SIGNER_PRIVATE_KEY ?? '',
  riftPerShard: Number(env.RIFT_PER_SHARD ?? 1),
  minClaimShards: Number(env.MIN_CLAIM_SHARDS ?? 100),
  minRealtimeRatio: Number(env.MIN_REALTIME_RATIO ?? 0.9),
  demoShips: env.DEMO_SHIPS === '1',
  adminToken: env.ADMIN_TOKEN ?? '',
  arenaAuto: env.ARENA_AUTO === '1',
  arenaFee: Number(env.ARENA_FEE ?? 100),
  arenaHours: Number(env.ARENA_HOURS ?? 24)
});

const addr = await app.listen();
console.log(`RIFTFALL servidor en http://${addr.address === '0.0.0.0' ? 'localhost' : addr.address}:${addr.port}`);
console.log(app.chain ? `Blockchain: chainId ${app.chain.deployment.chainId}` : 'Blockchain: desactivada (modo invitado, sin canjes)');

const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
