import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

test('partida completa en el navegador verificada por el servidor', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('.logo')).toBeVisible();
  await expect(page.locator('#netStatus')).toContainText('En línea');
  await expect(page.locator('#missionList li')).toHaveCount(5);
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-ES' });
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

/** Sirve el build como hosting estático, sin servidor del juego (así está publicado hoy). */
async function staticSite(port) {
  const DIST = path.resolve('dist-e2e');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
  const site = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => site.listen(port, '127.0.0.1', r));
  return site;
}

test('modo práctica sin servidor: inglés, Núcleos, talentos, misiones locales y compartir', async ({ browser }) => {
  const site = await staticSite(4177);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    // Captura lo que el juego manda al menú de compartir del celular.
    await page.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = () => true;
      navigator.share = async (data) => {
        window.__shared = { text: data.text, files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) };
      };
    });
    await page.goto('http://127.0.0.1:4177/');
    await expect(page.locator('#playBtn')).toHaveText('PLAY');
    await expect(page.locator('#netStatus')).toContainText('Practice mode');
    await expect(page.locator('#missionList li')).toHaveCount(5);
    await expect(page.locator('#missionList')).toContainText('Play 3 runs');
    await expect(page.locator('#menuCores')).toHaveText('0');

    await page.click('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => window.__RIFTFALL__.fastForward(150));
    // Terminar la partida desde la pausa (aunque haya quedado abierta una elección de mejora).
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#goVerify')).toContainText('saved on this device');
    await expect(page.locator('#goTotalLabel')).toHaveText('CORES EARNED');
    await expect(page.locator('#goRewardList li').first()).toContainText('Cores from this run');
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.progress')));
    expect(progress.runs).toBe(1);
    expect(progress.cores).toBeGreaterThan(0);
    expect(progress.streak).toBe(1);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/riftfall-practice-over.png' });

    // Compartir: imagen PNG + texto con el link del juego.
    await page.click('#shareBtn');
    await page.waitForFunction(() => window.__shared !== null);
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.files).toHaveLength(1);
    expect(shared.files[0].type).toBe('image/png');
    expect(shared.files[0].size).toBeGreaterThan(20_000);
    expect(shared.text).toContain('RIFTFALL');
    expect(shared.text).toContain('http://127.0.0.1:4177/');

    // Talentos: con Núcleos suficientes se mejora uno y la próxima partida lo aplica.
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('riftfall.progress'));
      p.cores = 500;
      localStorage.setItem('riftfall.progress', JSON.stringify(p));
    });
    await page.reload();
    await expect(page.locator('#talentDot')).toBeVisible();
    await page.click('.nav-grid [data-open="profile"]');
    await expect(page.locator('#sheetTitle')).toHaveText('Talents');
    await expect(page.locator('.talent')).toHaveCount(6);
    const hull = page.locator('.talent', { hasText: 'Reinforced Hull' });
    await hull.locator('button').click();
    await expect(page.locator('.toast.ok', { hasText: 'Reinforced Hull reached level 1' })).toBeVisible();
    await expect(hull.locator('.pips i.on')).toHaveCount(1);
    await expect(page.locator('#menuCores')).toHaveText('460');
    await page.screenshot({ path: 'test-results/riftfall-talents.png' });
    await page.click('#sheetClose');
    await page.click('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    const sim = await page.evaluate(() => ({ talents: window.__RIFTFALL__.game.sim.talents, maxHp: window.__RIFTFALL__.game.sim.player.stats.maxHp }));
    expect(sim.talents).toEqual({ hull: 1 });
    expect(sim.maxHp).toBeCloseTo(106, 6);

    // Portugués por parámetro de la URL.
    const pt = await ctx.newPage();
    pt.on('pageerror', (e) => errors.push(e.message));
    await pt.goto('http://127.0.0.1:4177/?lang=pt');
    await expect(pt.locator('#playBtn')).toHaveText('JOGAR');
    await expect(pt.locator('.nav-grid [data-open="profile"]')).toContainText('Talentos');
    await expect(pt.locator('#missionList')).toContainText('Jogue 3 partidas');
  } finally {
    site.close();
    await ctx.close();
  }
  expect(errors).toEqual([]);
});
