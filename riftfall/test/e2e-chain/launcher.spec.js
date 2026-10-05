import { test, expect } from '@playwright/test';
import { JsonRpcProvider, Contract, Interface, formatEther, parseEther } from 'ethers';
import generated from '../../src/generated/contracts.json' with { type: 'json' };

// Cuenta #5 de Hardhat (desbloqueada en el nodo local) como "creador" que usa el Lanzador.
const CREATOR = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const BUYER = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // cuenta #6
const SERVER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // cuenta #1
const RPC = 'http://127.0.0.1:8545';

async function injectWallet(page, rejectAt) {
  await page.addInitScript(({ rpc, account, rejectAt }) => {
    let id = 0;
    let sends = 0;
    const call = async (method, params = []) => {
      const r = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
      });
      const j = await r.json();
      if (j.error) {
        const e = new Error(j.error.message);
        e.code = j.error.code;
        throw e;
      }
      return j.result;
    };
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain' || method === 'wallet_watchAsset') return null;
        if (method === 'eth_sendTransaction') {
          sends++;
          if (sends === rejectAt) {
            const e = new Error('User rejected the request.');
            e.code = 4001;
            throw e;
          }
        }
        return call(method, params);
      },
      on() {},
      removeListener() {}
    };
  }, { rpc: RPC, account: CREATOR, rejectAt });
}

test('Lanzador: crea token y contratos desde la wallet, reanuda tras un rechazo y administra', async ({ browser }) => {
  const errors = [];
  // Primera sesión: la wallet rechaza la 4ª transacción (como si el usuario cerrara la app).
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await injectWallet(page, 4);
  await page.goto('/lanzar.html');
  await expect(page.locator('#walletBody')).toContainText('0x9965');
  await expect(page.locator('.lx-option.on')).toContainText('Red local');
  await page.fill('#tokenName', 'Lamer Coin');
  await page.fill('#tokenSymbol', 'lamer');
  await expect(page.locator('#tokenSymbol')).toHaveValue('LAMER');
  await expect(page.locator('#costBox')).toContainText('COSTO ESTIMADO');
  await page.click('#launchBtn');
  await expect(page.locator('.toast.err', { hasText: 'Cancelaste' })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#progress li.ok')).toHaveCount(3);
  await expect(page.locator('#progress li.err')).toHaveCount(1);

  // Segunda sesión (recarga): el progreso se recupera y el lanzamiento termina.
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await injectWallet(page, 0);
  await page.goto('/lanzar.html');
  await expect(page.locator('#launchBtn')).toHaveText('Continuar el lanzamiento');
  await expect(page.locator('#tokenName')).toHaveValue('Lamer Coin');
  await page.click('#launchBtn');
  await expect(page.locator('#stepDone')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#progress li.ok')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/riftfall-launcher.png', fullPage: true });

  const dep = JSON.parse(await page.locator('#doneBody pre').textContent());
  expect(dep.token).toEqual({ name: 'Lamer Coin', symbol: 'LAMER' });
  const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true, cacheTimeout: -1 });
  const c = (name) => new Contract(dep.contracts[name], generated.contracts[name].abi, provider);
  expect(await c('RiftToken').name()).toBe('Lamer Coin');
  expect(formatEther(await c('RiftToken').balanceOf(dep.contracts.RewardVault))).toBe('400000000.0');
  expect(formatEther(await c('RiftToken').balanceOf(dep.contracts.TeamVesting))).toBe('150000000.0');
  expect(formatEther(await c('RiftToken').balanceOf(CREATOR))).toBe('450000000.0');
  expect(await c('RiftShips').classCount()).toBe(4n);
  for (const name of ['RewardVault', 'RiftShips', 'RiftMarket', 'RiftArena']) expect(await c(name).owner()).toBe(CREATOR);
  expect(await c('RiftShips').treasury()).toBe(CREATOR);

  // Un jugador compra una nave: el creador cobra la venta desde Administración.
  const data = new Interface(generated.contracts.RiftShips.abi).encodeFunctionData('mint', [0]);
  await provider.send('eth_sendTransaction', [{ from: BUYER, to: dep.contracts.RiftShips, data, value: '0x' + parseEther('0.004').toString(16) }]);
  await page.reload();
  const withdraw = page.locator('#adminBody button', { hasText: 'Cobrar' });
  await expect(withdraw).toContainText('0,004', { timeout: 20_000 });
  await withdraw.click();
  await expect(page.locator('.toast.ok', { hasText: 'Ventas cobradas' })).toBeVisible({ timeout: 30_000 });
  expect(await provider.getBalance(dep.contracts.RiftShips)).toBe(0n);

  // Registrar la dirección del servidor como firmante de recompensas y operador de Arena.
  await page.fill('#adminBody input', SERVER);
  await page.locator('#adminBody button', { hasText: 'Cambiar firmante' }).click();
  await expect(page.locator('.toast.ok', { hasText: 'Firmante' })).toBeVisible({ timeout: 30_000 });
  expect(await c('RewardVault').signer()).toBe(SERVER);
  expect(await c('RiftArena').operator()).toBe(SERVER);

  expect(errors).toEqual([]);
  await ctx.close();
});
