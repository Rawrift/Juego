// Uso:
//   npm run deploy:local      (con `npm run chain` corriendo en otra terminal)
//   npm run deploy:testnet    (Base Sepolia — requiere DEPLOYER_PRIVATE_KEY)
//   npm run deploy:mainnet    (Base — requiere DEPLOYER_PRIVATE_KEY y revisar ECONOMIA.md antes)
//
// Variables opcionales (direcciones):
//   RIFT_OWNER       multisig (Safe) que será owner de los contratos (Ownable2Step: debe aceptar)
//   RIFT_TREASURY    adonde llegan ventas, comisiones y rake (recomendado: la misma Safe)
//   RIFT_SIGNER      clave caliente del servidor que firma vales de recompensa
//   RIFT_OPERATOR    clave del servidor que crea y liquida torneos
//   RIFT_TEAM        beneficiario del vesting del equipo
//   RIFT_LIQUIDITY   quien recibe el 15% para crear el pool RIFT/ETH
//   RIFT_COMMUNITY   quien gestiona el 10% de comunidad/airdrops
//   RIFT_DIRECT_OWNER=1  el owner queda asignado desde el constructor (sin acceptOwnership)
//   RIFT_TOKEN_NAME / RIFT_TOKEN_SYMBOL  nombre y símbolo del token (por defecto Riftfall / RIFT)

const fs = require('node:fs');
const path = require('node:path');
const hre = require('hardhat');
const { deployAll } = require('./deploy-lib.cjs');

async function main() {
  const { ethers, network } = hre;
  const [deployer, ...others] = await ethers.getSigners();
  const env = process.env;
  const isLocal = network.name === 'localhost' || network.name === 'hardhat';

  // En local usamos cuentas de Hardhat conocidas para que todo funcione sin configurar nada.
  const signer = env.RIFT_SIGNER ?? (isLocal ? others[0].address : deployer.address);
  const opts = {
    deployer,
    owner: env.RIFT_OWNER,
    treasury: env.RIFT_TREASURY ?? (isLocal ? others[1].address : undefined),
    signer,
    operator: env.RIFT_OPERATOR ?? signer,
    teamBeneficiary: env.RIFT_TEAM,
    liquidityHolder: env.RIFT_LIQUIDITY,
    communityHolder: env.RIFT_COMMUNITY,
    directOwner: env.RIFT_DIRECT_OWNER === '1',
    tokenName: env.RIFT_TOKEN_NAME,
    tokenSymbol: env.RIFT_TOKEN_SYMBOL,
    log: (name, addr) => console.log(`  ${name.padEnd(12)} ${addr}`)
  };
  if (!isLocal && !env.RIFT_SIGNER) {
    console.warn('AVISO: RIFT_SIGNER no definido; el deployer firmará vales. Usa una clave separada en producción.');
  }

  console.log(`Desplegando RIFTFALL en ${network.name} con ${deployer.address}`);
  const d = await deployAll(ethers, opts);
  const { chainId } = await ethers.provider.getNetwork();
  const out = {
    chainId: Number(chainId),
    network: network.name,
    deployedAt: new Date().toISOString(),
    token: { name: await d.token.name(), symbol: await d.token.symbol() },
    contracts: {
      RiftToken: d.token.target,
      RewardVault: d.vault.target,
      RiftShips: d.ships.target,
      RiftMarket: d.market.target,
      RiftArena: d.arena.target,
      TeamVesting: d.vesting.target
    },
    roles: d.config
  };

  const testerFunds = ethers.parseEther('250000');
  if (isLocal && (await d.token.balanceOf(deployer.address)) >= testerFunds) {
    // Fondos de prueba: la cuenta #3 de Hardhat recibe RIFT para probar mercado y forja.
    const tester = others[2];
    await (await d.token.transfer(tester.address, testerFunds)).wait();
    out.localTester = tester.address;
  }

  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${out.chainId}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nDirecciones guardadas en ${path.relative(process.cwd(), file)}`);
  if (opts.owner && !opts.directOwner) console.log('Recuerda: el owner debe llamar acceptOwnership() en Vault, Ships, Market y Arena.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
