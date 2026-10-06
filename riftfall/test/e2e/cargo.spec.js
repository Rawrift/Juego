import { test, expect } from '@playwright/test';

// Rift Cargo: el segundo juego, en /cargo/. Las pruebas adelantan la simulación desde la página
// (window.__CARGO__) para no esperar los viajes en tiempo real.

const skipTutorial = (page) => page.evaluate(() => {
  window.__CARGO__.state.flags.tut = 99;
  document.querySelector('#coach').hidden = true;
});

test('pedido completo: drones cargan, la nave entrega, se cobra y se guarda', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/cargo/');
  await expect(page.locator('.topbar .brand')).toContainText('Rift Cargo');
  await expect(page.locator('.stage-canvas')).toBeVisible();
  // El tutorial señala el primer pedido.
  await expect(page.locator('#coach')).toBeVisible();
  await expect(page.locator('.tut-target')).toContainText('Vesta');

  const credits = await page.evaluate(() => window.__CARGO__.state.credits);
  await page.locator('.tut-target .btn.primary').click();
  await expect(page.locator('#track')).toContainText('RC-101');
  await page.waitForFunction(() => window.__CARGO__.state.ships[0].status === 'working', null, { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/cargo-loading.png' });

  // Se adelanta el tiempo hasta que la nave entrega y vuelve.
  await page.evaluate(() => {
    const g = window.__CARGO__;
    for (let i = 0; i < 4000 && g.state.ships[0].job; i++) g.step(g.state, 0.1);
  });
  await expect(page.locator('.toast.ok').first()).toContainText('Vesta', { timeout: 10_000 });
  const after = await page.evaluate(() => ({ credits: window.__CARGO__.state.credits, delivered: window.__CARGO__.state.stats.delivered, agua: window.__CARGO__.state.stock.agua }));
  expect(after.delivered).toBe(1);
  expect(after.credits).toBeGreaterThan(credits);
  expect(after.agua).toBe(20);

  // Al recargar la partida sigue ahí.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  const reloaded = await page.evaluate(() => window.__CARGO__.state.stats.delivered);
  expect(reloaded).toBe(1);
  expect(errors).toEqual([]);
});

test('mercado: comprar carga la trae al depósito', async ({ page }) => {
  await page.goto('/cargo/');
  await expect(page.locator('.stage-canvas')).toBeVisible();
  await skipTutorial(page);
  await page.locator('#tabs [data-v="market"]').click();
  const buy = page.locator('[data-port-card="kepa"] .btn.primary');
  await expect(buy).toBeEnabled();
  await buy.click();
  const incoming = await page.evaluate(() => window.__CARGO__.state.incoming.agua);
  expect(incoming).toBeGreaterThan(0);
  await page.evaluate(() => {
    const g = window.__CARGO__;
    for (let i = 0; i < 4000 && g.state.ships.some((s) => s.job); i++) g.step(g.state, 0.1);
  });
  const stock = await page.evaluate(() => ({ agua: window.__CARGO__.state.stock.agua, incoming: window.__CARGO__.state.incoming.agua }));
  expect(stock.agua).toBe(40 + incoming);
  expect(stock.incoming).toBe(0);
});

test('mapa del sistema y mejoras', async ({ page }) => {
  await page.goto('/cargo/');
  await expect(page.locator('.stage-canvas')).toBeVisible();
  await skipTutorial(page);
  await page.locator('#mapToggle').click();
  await expect(page.locator('.map-lbl[data-port="vesta"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.map-lbl[data-port="nimbus"]')).toContainText('3');
  await page.screenshot({ path: 'test-results/cargo-map.png' });
  await page.locator('[data-act="view"][data-v="station"]').first().click();
  await expect(page.locator('.map-lbl[data-port="vesta"]')).toBeHidden();

  await page.locator('#tabs [data-v="station"]').click();
  const before = await page.evaluate(() => window.__CARGO__.state.up.drones);
  await page.locator('[data-act="upgrade"][data-v="drones"]').click();
  const after = await page.evaluate(() => window.__CARGO__.state.up.drones);
  expect(after).toBe(before + 1);
});

test('celular: barra de pestañas y panel deslizable', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
  await page.goto('/cargo/');
  await expect(page.locator('.mtabs')).toBeVisible();
  await skipTutorial(page);
  await page.locator('.mtabs [data-v="fleet"]').tap();
  await expect(page.locator('#ops')).toBeInViewport();
  await expect(page.locator('#panel')).toContainText('RC-101');
  await page.screenshot({ path: 'test-results/cargo-mobile.png' });
  await page.close();
});
