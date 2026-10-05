// Despliegue compartido por scripts/deploy.cjs y por los tests de contratos.
// Toda la economía on-chain se parametriza aquí para que haya una única fuente de verdad.

const SUPPLY = 1_000_000_000n;

/** Reparto del suministro total (suma 100). */
const ALLOCATION = {
  rewards: 40, // RewardVault: recompensas para jugadores, emitidas con halving
  liquidity: 15, // par RIFT/ETH en un DEX (lo aporta el creador y cobra las comisiones LP)
  team: 15, // creador, bloqueado en TeamVesting (cliff 6 meses, 24 meses lineal)
  treasury: 20, // operación: marketing, botes de torneos, partnerships
  community: 10 // airdrops, misiones de lanzamiento, creadores de contenido
};

/** Catálogo inicial de naves NFT. classId on-chain = índice. Los stats viven en src/sim/content.js. */
const SHIP_CLASSES = [
  { name: 'VANGUARD', color: '#4dff9a', priceEth: '0.004', priceRift: 2500n, maxSupply: 5000 },
  { name: 'PHANTOM', color: '#b36bff', priceEth: '0.01', priceRift: 6000n, maxSupply: 3000 },
  { name: 'TEMPEST', color: '#38c8ff', priceEth: '0.025', priceRift: 15000n, maxSupply: 1500 },
  { name: 'LEVIATHAN', color: '#ffb02e', priceEth: '0.08', priceRift: 0n, maxSupply: 300 }
];

const DEFAULTS = {
  dailyEmission: 1_000_000n, // RIFT/día en el primer periodo de 180 días
  maxClaimPerPlayerPerDay: 3_000n,
  forgeBaseCost: 200n, // coste forja nivel L -> L+1 = base * L^2
  marketFeeBps: 500,
  cliffSeconds: 180n * 86400n,
  vestingSeconds: 720n * 86400n
};

async function deployAll(ethers, opts) {
  const o = { ...DEFAULTS, ...opts };
  const { deployer } = o;
  const owner = o.owner ?? deployer.address;
  const treasury = o.treasury ?? owner;
  const signer = o.signer ?? deployer.address;
  const operator = o.operator ?? signer;
  const teamBeneficiary = o.teamBeneficiary ?? owner;
  const liquidityHolder = o.liquidityHolder ?? deployer.address;
  const communityHolder = o.communityHolder ?? treasury;
  const unit = (n) => ethers.parseEther(n.toString());
  const log = o.log ?? (() => {});

  const Token = await ethers.getContractFactory('RiftToken', deployer);
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  log('RiftToken', token.target);

  const Vault = await ethers.getContractFactory('RewardVault', deployer);
  const vault = await Vault.deploy(
    token.target,
    deployer.address,
    signer,
    unit(o.dailyEmission),
    unit(o.maxClaimPerPlayerPerDay)
  );
  await vault.waitForDeployment();
  log('RewardVault', vault.target);

  const Ships = await ethers.getContractFactory('RiftShips', deployer);
  const ships = await Ships.deploy(token.target, vault.target, treasury, deployer.address, unit(o.forgeBaseCost));
  await ships.waitForDeployment();
  log('RiftShips', ships.target);
  for (const c of SHIP_CLASSES) {
    await (await ships.addClass(c.name, c.color, ethers.parseEther(c.priceEth), unit(c.priceRift), c.maxSupply)).wait();
  }

  const Market = await ethers.getContractFactory('RiftMarket', deployer);
  const market = await Market.deploy(ships.target, token.target, treasury, deployer.address, o.marketFeeBps);
  await market.waitForDeployment();
  log('RiftMarket', market.target);

  const Arena = await ethers.getContractFactory('RiftArena', deployer);
  const arena = await Arena.deploy(token.target, vault.target, treasury, operator, deployer.address);
  await arena.waitForDeployment();
  log('RiftArena', arena.target);

  const latest = await ethers.provider.getBlock('latest');
  const start = BigInt(latest.timestamp);
  const Vesting = await ethers.getContractFactory('TeamVesting', deployer);
  const vesting = await Vesting.deploy(teamBeneficiary, start, o.vestingSeconds, o.cliffSeconds);
  await vesting.waitForDeployment();
  log('TeamVesting', vesting.target);

  const pct = (p) => (SUPPLY * BigInt(p) * 10n ** 18n) / 100n;
  const transfers = [
    [vault.target, ALLOCATION.rewards],
    [vesting.target, ALLOCATION.team],
    [treasury, ALLOCATION.treasury],
    [communityHolder, ALLOCATION.community],
    [liquidityHolder, ALLOCATION.liquidity]
  ];
  for (const [to, p] of transfers) {
    if (to.toLowerCase() === deployer.address.toLowerCase()) continue;
    await (await token.transfer(to, pct(p))).wait();
  }

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    // Ownable2Step: el nuevo owner (idealmente una multisig Safe) debe llamar acceptOwnership().
    for (const c of [vault, ships, market, arena]) await (await c.transferOwnership(owner)).wait();
  }

  return { token, vault, ships, market, arena, vesting, config: { owner, treasury, signer, operator } };
}

module.exports = { deployAll, ALLOCATION, SHIP_CLASSES, DEFAULTS, SUPPLY };
