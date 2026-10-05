// Exporta ABI + bytecode de los contratos y los parámetros del despliegue a
// src/generated/contracts.json, que usa el Lanzador web (lanzar.html) para crear
// todo desde la wallet del creador. Ejecutar tras cambiar contratos: npm run export:contracts
const fs = require('node:fs');
const path = require('node:path');
const { SHIP_CLASSES, ALLOCATION, DEFAULTS, BNB_CHAINS } = require('./deploy-lib.cjs');

const ROOT = path.join(__dirname, '..');
const NAMES = ['RiftToken', 'RewardVault', 'RiftShips', 'RiftMarket', 'RiftArena', 'TeamVesting'];

function build() {
  const contracts = {};
  for (const name of NAMES) {
    const file = path.join(ROOT, 'artifacts', 'contracts', `${name}.sol`, `${name}.json`);
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    contracts[name] = { abi: a.abi, bytecode: a.bytecode };
  }
  return {
    contracts,
    deploy: {
      shipClasses: SHIP_CLASSES.map((c) => ({ ...c, priceRift: c.priceRift.toString() })),
      allocation: ALLOCATION,
      defaults: Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, v.toString()])),
      bnbChains: BNB_CHAINS
    }
  };
}

if (require.main === module) {
  const out = path.join(ROOT, 'src', 'generated', 'contracts.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(build()));
  console.log(`Exportado ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

module.exports = { build };
