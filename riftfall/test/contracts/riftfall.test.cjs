const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deployAll, shipClassArgs, ALLOCATION, SHIP_CLASSES } = require('../../scripts/deploy-lib.cjs');
const { build: exportContracts } = require('../../scripts/export-contracts.cjs');
const generated = require('../../src/generated/contracts.json');

const E = (n) => ethers.parseEther(n.toString());
const DAY = 86400;

async function fixture() {
  const [deployer, treasury, signer, alice, bob, carol, stranger] = await ethers.getSigners();
  const d = await deployAll(ethers, {
    deployer,
    treasury: treasury.address,
    signer: signer.address,
    operator: signer.address,
    liquidityHolder: deployer.address
  });
  // Damos RIFT a los jugadores de prueba desde la porción de liquidez del deployer.
  for (const p of [alice, bob, carol]) await d.token.transfer(p.address, E(1_000_000));
  return { ...d, deployer, treasury, signer, alice, bob, carol, stranger };
}

async function voucher(vault, signer, player, amount, claimId, deadline) {
  const { chainId } = await ethers.provider.getNetwork();
  const domain = { name: 'RiftfallRewardVault', version: '1', chainId, verifyingContract: vault.target };
  const types = {
    Claim: [
      { name: 'player', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimId', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };
  return signer.signTypedData(domain, types, { player, amount, claimId, deadline });
}

describe('RiftToken', () => {
  it('reparte el suministro fijo según la tabla de asignación', async () => {
    const { token, vault, vesting, treasury } = await loadFixture(fixture);
    expect(await token.totalSupply()).to.equal(E(1_000_000_000));
    expect(await token.balanceOf(vault.target)).to.equal(E(ALLOCATION.rewards * 10_000_000));
    expect(await token.balanceOf(vesting.target)).to.equal(E(ALLOCATION.team * 10_000_000));
    // treasury recibe tesorería + comunidad (communityHolder por defecto = treasury)
    expect(await token.balanceOf(treasury.address)).to.equal(
      E((ALLOCATION.treasury + ALLOCATION.community) * 10_000_000)
    );
  });

  it('acepta nombre y símbolo propios (el creador elige la marca)', async () => {
    const [deployer] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('RiftToken');
    const t = await Token.deploy('Lamer Coin', 'LAMER', deployer.address);
    expect(await t.name()).to.equal('Lamer Coin');
    expect(await t.symbol()).to.equal('LAMER');
    expect(await t.balanceOf(deployer.address)).to.equal(E(1_000_000_000));
  });

  it('no expone ninguna función de minteo', async () => {
    const { token } = await loadFixture(fixture);
    expect(token.interface.getFunction('mint')).to.equal(null);
  });

  it('el vesting del equipo no libera nada antes del cliff', async () => {
    const { token, vesting } = await loadFixture(fixture);
    expect(await vesting['releasable(address)'](token.target)).to.equal(0n);
    await time.increase(181 * DAY);
    expect(await vesting['releasable(address)'](token.target)).to.be.greaterThan(0n);
  });
});

describe('Despliegue', () => {
  it('en BNB Chain las naves se cobran en BNB y en el resto en ETH', () => {
    expect(shipClassArgs(ethers.parseEther, 97)[0].priceWei).to.equal(ethers.parseEther('0.015'));
    expect(shipClassArgs(ethers.parseEther, 56)[3].priceWei).to.equal(ethers.parseEther('0.3'));
    expect(shipClassArgs(ethers.parseEther, 8453)[0].priceWei).to.equal(ethers.parseEther('0.004'));
  });

  it('el bytecode exportado para el Lanzador coincide con los contratos compilados', () => {
    const fresh = exportContracts();
    for (const name of Object.keys(fresh.contracts)) {
      expect(generated.contracts[name].bytecode, `${name}: ejecuta npm run export:contracts`).to.equal(fresh.contracts[name].bytecode);
    }
    expect(generated.deploy).to.deep.equal(JSON.parse(JSON.stringify(fresh.deploy)));
  });

  it('el catálogo inicial queda creado en el constructor', async () => {
    const { ships } = await loadFixture(fixture);
    expect(await ships.classCount()).to.equal(4n);
    expect((await ships.getClass(3)).name).to.equal('LEVIATHAN');
  });
});

describe('RewardVault', () => {
  it('paga un vale firmado y rechaza su reutilización', async () => {
    const { vault, token, signer, alice } = await loadFixture(fixture);
    const deadline = (await time.latest()) + 3600;
    const sig = await voucher(vault, signer, alice.address, E(500), 1n, deadline);
    const before = await token.balanceOf(alice.address);
    await expect(vault.connect(alice).claim(E(500), 1n, deadline, sig))
      .to.emit(vault, 'Claimed')
      .withArgs(alice.address, 1n, E(500), 0n);
    expect(await token.balanceOf(alice.address)).to.equal(before + E(500));
    await expect(vault.connect(alice).claim(E(500), 1n, deadline, sig)).to.be.revertedWithCustomError(
      vault,
      'AlreadyClaimed'
    );
  });

  it('rechaza vales de otro firmante, de otro jugador o caducados', async () => {
    const { vault, signer, alice, bob, stranger } = await loadFixture(fixture);
    const deadline = (await time.latest()) + 3600;
    const forged = await voucher(vault, stranger, alice.address, E(10), 2n, deadline);
    await expect(vault.connect(alice).claim(E(10), 2n, deadline, forged)).to.be.revertedWithCustomError(
      vault,
      'BadSignature'
    );
    const forAlice = await voucher(vault, signer, alice.address, E(10), 3n, deadline);
    await expect(vault.connect(bob).claim(E(10), 3n, deadline, forAlice)).to.be.revertedWithCustomError(
      vault,
      'BadSignature'
    );
    await time.increase(7200);
    await expect(vault.connect(alice).claim(E(10), 3n, deadline, forAlice)).to.be.revertedWithCustomError(
      vault,
      'Expired'
    );
  });

  it('aplica el tope diario por jugador y lo reinicia al día siguiente', async () => {
    const { vault, signer, alice } = await loadFixture(fixture);
    let deadline = (await time.latest()) + 3 * DAY;
    await vault.connect(alice).claim(E(3000), 10n, deadline, await voucher(vault, signer, alice.address, E(3000), 10n, deadline));
    const extra = await voucher(vault, signer, alice.address, E(1), 11n, deadline);
    await expect(vault.connect(alice).claim(E(1), 11n, deadline, extra)).to.be.revertedWithCustomError(
      vault,
      'PlayerCapExceeded'
    );
    await time.increase(DAY);
    await expect(vault.connect(alice).claim(E(1), 11n, deadline, extra)).to.emit(vault, 'Claimed');
  });

  it('aplica el presupuesto global diario y el halving cada 180 días', async () => {
    const { vault, signer, alice, deployer } = await loadFixture(fixture);
    await vault.connect(deployer).setEmission(E(1_000_000), E(10_000_000));
    expect(await vault.dailyBudget(0)).to.equal(E(1_000_000));
    expect(await vault.dailyBudget(179)).to.equal(E(1_000_000));
    expect(await vault.dailyBudget(180)).to.equal(E(500_000));
    expect(await vault.dailyBudget(360)).to.equal(E(250_000));

    const deadline = (await time.latest()) + DAY / 2;
    await vault.connect(alice).claim(E(999_999), 20n, deadline, await voucher(vault, signer, alice.address, E(999_999), 20n, deadline));
    const over = await voucher(vault, signer, alice.address, E(2), 21n, deadline);
    await expect(vault.connect(alice).claim(E(2), 21n, deadline, over)).to.be.revertedWithCustomError(
      vault,
      'DailyBudgetExceeded'
    );
    expect(await vault.remainingToday()).to.equal(E(1));
  });

  it('el owner no puede subir la emisión ni retirar fondos sin timelock', async () => {
    const { vault, deployer, stranger, token } = await loadFixture(fixture);
    await expect(vault.setEmission(E(1_000_001), E(1))).to.be.revertedWith('Vault: above initial');
    await vault.scheduleMigration(stranger.address);
    await expect(vault.executeMigration()).to.be.revertedWith('Vault: timelock');
    await time.increase(14 * DAY);
    const bal = await token.balanceOf(vault.target);
    await expect(vault.connect(deployer).executeMigration()).to.emit(vault, 'Migrated').withArgs(stranger.address, bal);
  });

  it('se puede pausar ante una emergencia', async () => {
    const { vault, signer, alice } = await loadFixture(fixture);
    await vault.pause();
    const deadline = (await time.latest()) + 3600;
    const sig = await voucher(vault, signer, alice.address, E(1), 30n, deadline);
    await expect(vault.connect(alice).claim(E(1), 30n, deadline, sig)).to.be.revertedWithCustomError(
      vault,
      'EnforcedPause'
    );
  });
});

describe('RiftShips', () => {
  it('vende naves en ETH al precio exacto y el retiro va a la tesorería', async () => {
    const { ships, alice, treasury, stranger } = await loadFixture(fixture);
    const price = ethers.parseEther(SHIP_CLASSES[0].priceEth);
    await expect(ships.connect(alice).mint(0, { value: price - 1n })).to.be.revertedWith('Ships: price');
    await expect(ships.connect(alice).mint(0, { value: price }))
      .to.emit(ships, 'ShipMinted')
      .withArgs(alice.address, 1n, 0n, false);
    expect(await ships.ownerOf(1)).to.equal(alice.address);
    expect(await ships.levelOf(1)).to.equal(1);
    await expect(ships.connect(stranger).withdraw()).to.changeEtherBalance(treasury, price);
  });

  it('venta en RIFT: 40% quema, 30% al pool de recompensas, 30% tesorería', async () => {
    const { ships, token, vault, alice, treasury } = await loadFixture(fixture);
    const price = E(SHIP_CLASSES[1].priceRift);
    await token.connect(alice).approve(ships.target, price);
    const supply = await token.totalSupply();
    const vaultBefore = await token.balanceOf(vault.target);
    const tBefore = await token.balanceOf(treasury.address);
    await ships.connect(alice).mintWithRift(1);
    expect(await token.totalSupply()).to.equal(supply - (price * 40n) / 100n);
    expect(await token.balanceOf(vault.target)).to.equal(vaultBefore + (price * 30n) / 100n);
    expect(await token.balanceOf(treasury.address)).to.equal(tBefore + (price * 30n) / 100n);
    expect(await ships.classOf(1)).to.equal(1);
  });

  it('la clase legendaria solo se vende en ETH y respeta el suministro máximo', async () => {
    const { ships, alice, deployer } = await loadFixture(fixture);
    await expect(ships.connect(alice).mintWithRift(3)).to.be.revertedWith('Ships: no RIFT price');
    await ships.connect(deployer).addClass('TEST', '#fff', 1n, 0n, 1);
    await ships.connect(alice).mint(4, { value: 1n });
    await expect(ships.connect(alice).mint(4, { value: 1n })).to.be.revertedWith('Ships: sold out');
  });

  it('la forja sube el nivel con coste cuadrático hasta nivel 10', async () => {
    const { ships, token, alice, bob } = await loadFixture(fixture);
    await ships.connect(alice).mint(0, { value: ethers.parseEther(SHIP_CLASSES[0].priceEth) });
    await token.connect(alice).approve(ships.target, ethers.MaxUint256);
    expect(await ships.forgeCost(1)).to.equal(E(200));
    expect(await ships.forgeCost(9)).to.equal(E(200 * 81));
    await expect(ships.connect(bob).forge(1)).to.be.revertedWith('Ships: not owner');
    for (let i = 1; i < 10; i++) await ships.connect(alice).forge(1);
    expect(await ships.levelOf(1)).to.equal(10);
    await expect(ships.connect(alice).forge(1)).to.be.revertedWith('Ships: max level');
    const [ids, classes, levels] = await ships.shipsOf(alice.address);
    expect(ids).to.deep.equal([1n]);
    expect(classes).to.deep.equal([0n]);
    expect(levels).to.deep.equal([10n]);
  });

  it('genera metadatos e imagen SVG on-chain', async () => {
    const { ships, alice } = await loadFixture(fixture);
    await ships.connect(alice).mint(2, { value: ethers.parseEther(SHIP_CLASSES[2].priceEth) });
    const uri = await ships.tokenURI(1);
    const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
    expect(json.name).to.equal('TEMPEST #1');
    expect(json.attributes[1].value).to.equal(1);
    const svg = Buffer.from(json.image.split(',')[1], 'base64').toString();
    expect(svg).to.match(/^<svg/);
    expect(svg).to.contain('TEMPEST LV 1');
  });

  it('regalías ERC-2981 del 5% con tope del 10% y tope de tesorería en el reparto', async () => {
    const { ships, treasury } = await loadFixture(fixture);
    const [receiver, amount] = await ships.royaltyInfo(1, E(100));
    expect(receiver).to.equal(treasury.address);
    expect(amount).to.equal(E(5));
    await expect(ships.setRoyalty(1001)).to.be.revertedWith('Ships: royalty cap');
    await expect(ships.setSplit(1000, 1000)).to.be.revertedWith('Ships: treasury cap');
    await ships.setSplit(5000, 2000);
  });
});

describe('RiftMarket', () => {
  async function listed() {
    const f = await loadFixture(fixture);
    const { ships, market, alice } = f;
    await ships.connect(alice).mint(0, { value: ethers.parseEther(SHIP_CLASSES[0].priceEth) });
    await ships.connect(alice).setApprovalForAll(market.target, true);
    await market.connect(alice).list(1, E(1000));
    return f;
  }

  it('compra con 5% de comisión para la tesorería', async () => {
    const { market, ships, token, alice, bob, treasury } = await listed();
    await token.connect(bob).approve(market.target, E(1000));
    await expect(market.connect(bob).buy(1, E(1000))).to.changeTokenBalances(
      token,
      [bob, alice, treasury],
      [-E(1000), E(950), E(50)]
    );
    expect(await ships.ownerOf(1)).to.equal(bob.address);
    expect(await market.listedCount()).to.equal(0n);
  });

  it('protege al comprador frente a cambios de precio y anuncios obsoletos', async () => {
    const { market, ships, token, alice, bob, carol } = await listed();
    await token.connect(bob).approve(market.target, E(5000));
    await market.connect(alice).list(1, E(2000));
    await expect(market.connect(bob).buy(1, E(1000))).to.be.revertedWith('Market: price changed');
    await ships.connect(alice).transferFrom(alice.address, carol.address, 1);
    await expect(market.connect(bob).buy(1, E(2000))).to.be.revertedWith('Market: stale listing');
    await market.connect(bob).cancel(1); // cualquiera limpia un anuncio obsoleto
    expect(await market.listedCount()).to.equal(0n);
  });

  it('lista páginas de anuncios y tiene tope de comisión', async () => {
    const { market } = await listed();
    const [ids, sellers, prices] = await market.listedPage(0, 10);
    expect(ids).to.deep.equal([1n]);
    expect(prices).to.deep.equal([E(1000)]);
    expect(sellers.length).to.equal(1);
    await expect(market.setFee(1001)).to.be.revertedWith('Market: fee cap');
  });
});

describe('RiftArena', () => {
  async function tournament() {
    const f = await loadFixture(fixture);
    const { arena, token, signer, alice, bob, carol } = f;
    const endsAt = (await time.latest()) + DAY;
    await arena.connect(signer).create(E(100), endsAt, 1000, 500, [6000, 3000, 1000]);
    for (const p of [alice, bob, carol]) {
      await token.connect(p).approve(arena.target, E(100));
      await arena.connect(p).enter(0);
    }
    return { ...f, endsAt };
  }

  it('reparte el bote: 10% rake, 5% quema, premios y sobrante al pool', async () => {
    const { arena, token, vault, signer, alice, bob, treasury } = await tournament();
    await expect(arena.connect(signer).settle(0, [bob.address])).to.be.revertedWith('Arena: not ended');
    await time.increase(DAY);
    const supply = await token.totalSupply();
    const vaultBefore = await token.balanceOf(vault.target);
    // fees = 300, rake 30, burn 15, prize = 255; 2 ganadores: 60% y 30%; sobra 10% -> vault
    await expect(arena.connect(signer).settle(0, [bob.address, alice.address])).to.changeTokenBalances(
      token,
      [treasury, bob, alice],
      [E(30), E(153), E('76.5')]
    );
    expect(await token.totalSupply()).to.equal(supply - E(15));
    expect(await token.balanceOf(vault.target)).to.equal(vaultBefore + E('25.5'));
  });

  it('rechaza ganadores duplicados o que no se inscribieron', async () => {
    const { arena, signer, bob, stranger } = await tournament();
    await time.increase(DAY);
    await expect(arena.connect(signer).settle(0, [bob.address, bob.address])).to.be.revertedWith('Arena: bad winner');
    await expect(arena.connect(signer).settle(0, [stranger.address])).to.be.revertedWith('Arena: bad winner');
    await expect(arena.connect(stranger).settle(0, [])).to.be.revertedWith('Arena: operator');
  });

  it('cancelación con reembolso íntegro', async () => {
    const { arena, token, signer, alice } = await tournament();
    await arena.connect(signer).cancel(0);
    await expect(arena.connect(alice).refund(0)).to.changeTokenBalance(token, alice, E(100));
    await expect(arena.connect(alice).refund(0)).to.be.revertedWith('Arena: nothing to refund');
  });

  it('valida topes de rake y suma de premios', async () => {
    const { arena, signer } = await loadFixture(fixture);
    const endsAt = (await time.latest()) + DAY;
    await expect(arena.connect(signer).create(1, endsAt, 1600, 0, [10000])).to.be.revertedWith('Arena: caps');
    await expect(arena.connect(signer).create(1, endsAt, 0, 0, [5000])).to.be.revertedWith('Arena: payout sum');
  });
});
