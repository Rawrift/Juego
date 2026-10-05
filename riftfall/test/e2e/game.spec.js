import { test, expect } from '@playwright/test';

test('partida completa en el navegador verificada por el servidor', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('.logo')).toBeVisible();
  await expect(page.locator('#netStatus')).toContainText('En línea');
  await expect(page.locator('#missionList li')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/riftfall-menu.png' });

  await page.click('#playBtn');
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => window.__RIFTFALL__.setAutopilot(true));
  await page.waitForFunction(() => window.__RIFTFALL__.game.sim.tick > 240, null, { timeout: 60_000 });
  await page.screenshot({ path: 'test-results/riftfall-gameplay.png' });

  // La HUD refleja la simulación.
  const timer = await page.locator('#timer').textContent();
  expect(timer).toMatch(/^\d\d:\d\d$/);

  await page.evaluate(() => window.__RIFTFALL__.setAutopilot(false));
  await page.click('#pauseBtn');
  await expect(page.locator('#pause')).toBeVisible();
  await page.click('#quitBtn');

  await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#goVerify')).toContainText('verificada', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/riftfall-gameover.png' });

  const result = await page.evaluate(async () => {
    const r = await fetch('/api/profile', { headers: { authorization: `Bearer ${localStorage.getItem('riftfall.token')}` } });
    return (await r.json()).profile;
  });
  expect(result.runs).toBe(1);

  await page.click('#menuBtn');
  await page.click('.nav-grid [data-open="ranking"]');
  await expect(page.locator('#sheetBody table tr')).toHaveCount(2);

  expect(errors).toEqual([]);
});

test('móvil: joystick táctil y menú adaptado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#controlsHint')).toContainText('Arrastra');
  await page.tap('#playBtn');
  await expect(page.locator('#hud')).toBeVisible();

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] });
  await expect(page.locator('#joystick')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: 600 }] });
  await page.waitForTimeout(800);
  const moved = await page.evaluate(() => window.__RIFTFALL__.game.sim.player.x);
  expect(moved).toBeGreaterThan(20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.screenshot({ path: 'test-results/riftfall-mobile.png' });
  expect(errors).toEqual([]);
  await ctx.close();
});
