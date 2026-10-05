import { test, expect } from '@playwright/test';

// Wallet inyectada (EIP-1193) que reenvía las peticiones al nodo Hardhat, donde la cuenta #3
// está desbloqueada: así el test recorre la interfaz real sin extensiones de navegador.
const ACCOUNT = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

async function injectWallet(page) {
  await page.addInitScript(({ rpc, account }) => {
    let id = 0;
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
        e.data = j.error.data;
        throw e;
      }
      return j.result;
    };
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
        return call(method, params);
      },
      on() {},
      removeListener() {}
    };
  }, { rpc: 'http://127.0.0.1:8545', account: ACCOUNT });
}

async function closeSheet(page) {
  await page.click('#sheetClose');
  await expect(page.locator('#sheet')).toBeHidden();
}

test('economía on-chain completa desde la interfaz', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept('500'));
  await injectWallet(page);
  await page.goto('/');
  await expect(page.locator('#netStatus')).toContainText('31337');

  // 1. Conectar wallet (firma de login sin gas)
  await page.click('#walletBtn');
  await expect(page.locator('#walletBtn')).toContainText('0x90F7', { timeout: 20_000 });
  await expect(page.locator('#menuRift')).toHaveText('250.000');

  // 2. Comprar una VANGUARD con ETH, usarla y forjarla a nivel 2
  await page.click('.nav-grid [data-open="hangar"]');
  await page.locator('.ship-card', { hasText: 'VANGUARD' }).locator('button', { hasText: 'ETH' }).click();
  await expect(page.locator('.toast.ok', { hasText: 'VANGUARD es tuya' })).toBeVisible({ timeout: 30_000 });
  const myCard = page.locator('.ship-card', { hasText: '#1 · NV 1' });
  await expect(myCard).toBeVisible({ timeout: 20_000 });
  await myCard.locator('button', { hasText: 'Usar' }).click();
  await page.locator('.ship-card', { hasText: '#1 · NV 1' }).locator('button', { hasText: 'Forjar NV 2' }).click();
  await expect(page.locator('.ship-card', { hasText: '#1 · NV 2' })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/riftfall-hangar-chain.png' });
  await closeSheet(page);
  await expect(page.locator('#shipName')).toHaveText('VANGUARD · NV 2');

  // 3. Jugar con la nave NFT; el servidor verifica la propiedad on-chain y aplica su bonus
  await page.click('#playBtn');
  await page.evaluate(() => window.__RIFTFALL__.setAutopilot(true));
  await page.waitForFunction(() => window.__RIFTFALL__.game.sim.tick > 300, null, { timeout: 90_000 });
  await page.evaluate(() => window.__RIFTFALL__.setAutopilot(false));
  await page.click('#pauseBtn');
  await page.click('#quitBtn');
  await expect(page.locator('#goVerify')).toContainText('verificada', { timeout: 30_000 });
  await expect(page.locator('#goRewardList')).toContainText('x1.13');
  await page.click('#menuBtn');

  // 4. Canjear Shards por RIFT: vale EIP-712 del servidor + transacción del jugador
  const shards = Number((await page.locator('#menuShards').textContent()).replace(/\D/g, ''));
  expect(shards).toBeGreaterThanOrEqual(5);
  await page.click('.nav-grid [data-open="vault"]');
  await page.locator('.field input').fill(String(shards));
  await page.locator('.field button', { hasText: 'Canjear' }).click();
  await expect(page.locator('.toast.ok', { hasText: 'RIFT recibidos' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.claim-item .status.paid')).toBeVisible({ timeout: 20_000 });
  await closeSheet(page);

  // 5. Publicar la nave en el Mercado (precio por diálogo) y verla anunciada
  await page.click('.nav-grid [data-open="hangar"]');
  await page.locator('.ship-card', { hasText: '#1 · NV 2' }).locator('button', { hasText: 'Vender' }).click();
  await expect(page.locator('.toast.ok', { hasText: 'publicada' })).toBeVisible({ timeout: 30_000 });
  await closeSheet(page);
  await page.click('.nav-grid [data-open="market"]');
  await expect(page.locator('.ship-card', { hasText: 'Retirar' })).toBeVisible({ timeout: 20_000 });
  await closeSheet(page);

  // 6. Arena: torneo automático, inscripción pagando RIFT y acceso a la partida de Arena
  await page.click('.cta-row [data-open="arena"]');
  await page.locator('#sheetBody button', { hasText: 'Inscribirme' }).click();
  await expect(page.locator('#sheetBody button', { hasText: 'JUGAR ARENA' })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/riftfall-arena-chain.png' });
  await page.locator('#sheetBody button', { hasText: 'JUGAR ARENA' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => window.__RIFTFALL__.game.run.mode)).toBe('arena');

  expect(errors).toEqual([]);
});
