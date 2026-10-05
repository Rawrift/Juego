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

test('PC: la nave sigue al mouse, se queda quieta sobre él y el teclado tiene prioridad', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.click('#playBtn');
  await expect(page.locator('#hud')).toBeVisible();
  const state = () =>
    page.evaluate(() => {
      const { game, renderer } = window.__RIFTFALL__;
      return { x: game.sim.player.x, y: game.sim.player.y, sx: renderer.R.shipSX, sy: renderer.R.shipSY, tick: game.sim.tick };
    });
  // Esperas medidas en ticks de la simulación (el navegador de pruebas dibuja lento).
  const ticks = (n) =>
    page.evaluate(async (n) => {
      const sim = window.__RIFTFALL__.game.sim;
      const end = sim.tick + n;
      while (sim.tick < end) await new Promise((r) => requestAnimationFrame(r));
    }, n);

  // Puntero a la derecha de la nave: avanza hacia la derecha.
  let s0 = await state();
  await page.mouse.move(s0.sx + 300, s0.sy, { steps: 4 });
  await expect(page.locator('#game')).toHaveClass(/steer/);
  await ticks(40);
  let s1 = await state();
  expect(s1.x - s0.x).toBeGreaterThan(80);
  expect(Math.abs(s1.y - s0.y)).toBeLessThan(40);

  // Puntero encima de la nave: se detiene.
  await page.mouse.move(s1.sx, s1.sy, { steps: 2 });
  await ticks(10);
  s0 = await state();
  await ticks(30);
  s1 = await state();
  expect(Math.hypot(s1.x - s0.x, s1.y - s0.y)).toBeLessThan(25);

  // El teclado manda: al usarlo, el mouse quieto deja de tirar de la nave.
  await page.mouse.move(s1.sx, s1.sy + 250);
  await page.keyboard.down('ArrowUp');
  await ticks(30);
  await page.keyboard.up('ArrowUp');
  s0 = await state();
  expect(s0.y).toBeLessThan(s1.y - 50);
  await ticks(30);
  s1 = await state();
  expect(Math.hypot(s1.x - s0.x, s1.y - s0.y)).toBeLessThan(25);
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
    // Sin token desplegado: estas pruebas cubren el modo práctica puro.
    if (url.pathname === '/deployment.json') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
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

test('modo práctica sin servidor: inglés, Núcleos, habilidades, misiones locales y compartir', async ({ browser }) => {
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
    // Niveles del Rift: empieza en 0 y el siguiente está bloqueado hasta ganar.
    await expect(page.locator('#riftNum')).toHaveText('0');
    await expect(page.locator('#riftDesc')).toContainText('Reward x1.00');
    await page.click('#riftNext');
    await expect(page.locator('.toast').last()).toContainText('Win level 0 to unlock 1');
    // Con el nivel 3 abierto (como si hubiera ganado), se puede elegir y cambia la descripción.
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('riftfall.progress') || '{}');
      localStorage.setItem('riftfall.progress', JSON.stringify({ ...p, riftMax: 3 }));
    });
    await page.reload();
    await page.click('#riftNext');
    await page.click('#riftNext');
    await expect(page.locator('#riftNum')).toHaveText('2');
    await expect(page.locator('#riftDesc')).toContainText('+36% HP');
    await page.click('#riftPrev');
    await page.click('#riftPrev');
    await expect(page.locator('#riftNum')).toHaveText('0');

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
    await expect(page.locator('#sheetTitle')).toHaveText('Skills');
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
    await expect(pt.locator('.nav-grid [data-open="profile"]')).toContainText('Habilidades');
    await expect(pt.locator('#missionList')).toContainText('Jogue 3 partidas');
  } finally {
    site.close();
    await ctx.close();
  }
  expect(errors).toEqual([]);
});

test('celular en horizontal: menú, mejoras y fin de partida entran en pantalla', async ({ browser }) => {
  const site = await staticSite(4181);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:4181/');
    const inView = async (sel) => {
      const b = await page.locator(sel).boundingBox();
      return b && b.y >= 0 && b.y + b.height <= 390;
    };
    expect(await inView('#playBtn')).toBe(true);
    await expect(page.locator('.nav-grid [data-open="profile"]')).toContainText('Habilidades');
    await page.tap('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => {
      window.__RIFTFALL__.fastForward(30);
      window.__RIFTFALL__.game.sim.pendingLevels = 1;
    });
    await expect(page.locator('#levelup')).toBeVisible();
    await expect(page.locator('#choices .choice')).toHaveCount(3);
    expect(await inView('#choices .choice:nth-child(3)')).toBe(true);
    await page.screenshot({ path: 'test-results/riftfall-landscape-levelup.png' });
    await page.locator('#choices .choice').first().tap();
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    for (const sel of ['#againBtn', '#shareBtn', '#goTalentsBtn', '#menuBtn']) expect(await inView(sel), sel).toBe(true);
    await page.screenshot({ path: 'test-results/riftfall-landscape-over.png' });
  } finally {
    site.close();
    await ctx.close();
  }
  expect(errors).toEqual([]);
});

test('Pase Fundador: pago en USDT verificado en la cadena, pintura dorada y restauración por hash', async ({ page }) => {
  const PAYER = '0x1111111111111111111111111111111111111111';
  const TREASURY = '0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd';
  const USDT = '0x55d398326f99059fF775485246999027B3197955';
  const HASH = `0x${'ab'.repeat(32)}`;
  const pad = (a) => `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
  const word = (n) => BigInt(n).toString(16).padStart(64, '0');
  const tenUsdt = 10n * 10n ** 18n;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Wallet simulada (EIP-1193): arranca en la red de pruebas y anota lo que se le pide firmar.
  await page.addInitScript((payer) => {
    let chain = '0x61';
    window.__sent = [];
    window.ethereum = {
      isMetaMask: true,
      on() {},
      removeListener() {},
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [payer];
        if (method === 'eth_chainId') return chain;
        if (method === 'net_version') return String(parseInt(chain, 16));
        if (method === 'wallet_switchEthereumChain') {
          chain = params[0].chainId;
          return null;
        }
        if (method === 'eth_sendTransaction') {
          window.__sent.push({ ...params[0], chain });
          return `0x${'ab'.repeat(32)}`;
        }
        throw Object.assign(new Error(`no soportado: ${method}`), { code: 4200 });
      }
    };
  }, PAYER);

  // Red principal simulada: precio del BNB = 800 USD y el pago de 10 USDT ya minado.
  const tx = {
    hash: HASH, blockHash: `0x${'cd'.repeat(32)}`, blockNumber: '0x10', transactionIndex: '0x0', type: '0x0',
    from: PAYER, to: USDT, value: '0x0', nonce: '0x1', gas: '0x15f90', gasPrice: '0x2faf080', chainId: '0x38',
    input: `0xa9059cbb${pad(TREASURY).slice(2)}${word(tenUsdt)}`,
    v: '0x93', r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}`
  };
  const receipt = {
    transactionHash: HASH, blockHash: tx.blockHash, blockNumber: '0x10', transactionIndex: '0x0', type: '0x0',
    from: PAYER, to: USDT, status: '0x1', gasUsed: '0xcb20', cumulativeGasUsed: '0xcb20', effectiveGasPrice: '0x2faf080',
    contractAddress: null, logsBloom: `0x${'0'.repeat(512)}`,
    logs: [{
      address: USDT, blockHash: tx.blockHash, blockNumber: '0x10', transactionHash: HASH, transactionIndex: '0x0', logIndex: '0x0', removed: false,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad(PAYER), pad(TREASURY)],
      data: `0x${word(tenUsdt)}`
    }]
  };
  const answer = (req) => {
    switch (req.method) {
      case 'eth_chainId': return '0x38';
      case 'eth_blockNumber': return '0x11';
      case 'eth_call': return `0x${word(800_000n * 10n ** 18n)}${word(1000n * 10n ** 18n)}${word(1)}`;
      case 'eth_getTransactionByHash': return tx;
      case 'eth_getTransactionReceipt': return receipt;
      default: return null;
    }
  };
  await page.context().route((u) => u.hostname === 'bsc-rpc.publicnode.com', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const out = Array.isArray(body) ? body.map((r) => ({ jsonrpc: '2.0', id: r.id, result: answer(r) })) : { jsonrpc: '2.0', id: body.id, result: answer(body) };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });

  await page.goto('/');
  await expect(page.locator('#founderChip')).toBeHidden();
  await page.click('#founderBanner');
  await expect(page.locator('#sheetTitle')).toHaveText('Pase Fundador');
  await expect(page.locator('.tier-card')).toHaveCount(3);
  await expect(page.locator('.tier-gold')).toContainText('Pagar ≈0.0125 BNB');
  await page.click('.tier-gold >> text=Pagar 10 USDT');
  await expect(page.locator('.toast').last()).toContainText('Ya eres Fundador Oro', { timeout: 20_000 });

  // Se pidió exactamente una transferencia de 10 USDT a la wallet del creador, en la red principal.
  const sent = await page.evaluate(() => window.__sent);
  expect(sent).toHaveLength(1);
  expect(sent[0].chain).toBe('0x38');
  expect(sent[0].to.toLowerCase()).toBe(USDT.toLowerCase());
  expect(sent[0].data).toBe(tx.input);

  await expect(page.locator('#founderChip')).toBeVisible();
  await expect(page.locator('.founder-status')).toContainText('Eres Fundador Oro');
  await expect(page.locator('.tier-pilot .tier-owned')).toBeVisible();
  await page.click('.skin-row >> text=Dorada');
  expect(await page.evaluate(() => window.__RIFTFALL__.renderer.R.skin)).toBe('founder');
  expect(await page.evaluate(() => window.__RIFTFALL__.renderer.R.trailColor)).toBe('#ffd23d');

  // Otro dispositivo: sin datos locales, se recupera con el hash del pago.
  await page.evaluate(() => {
    localStorage.removeItem('riftfall.founder');
    localStorage.removeItem('riftfall.skin');
  });
  await page.reload();
  await expect(page.locator('#founderChip')).toBeHidden();
  await page.click('#founderBanner');
  await page.fill('.hash-input', 'basura');
  await page.click('text=Verificar pago');
  await expect(page.locator('.toast').last()).toContainText('no es un hash de transacción válido');
  await page.fill('.hash-input', HASH);
  await page.click('text=Verificar pago');
  await expect(page.locator('.founder-status')).toContainText('Eres Fundador Oro');
  await expect(page.locator('#founderChip')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Desafío del Día sin servidor: misma semilla, reglas fijas, mejor marca y texto para compartir', async ({ browser }) => {
  const { dailyNumber, dailySeed } = await import('../../src/shared/daily.js');
  const n = dailyNumber();
  const site = await staticSite(4178);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' });
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = () => false;
      navigator.share = async (data) => {
        window.__shared = data.text;
      };
      // Aunque tenga habilidades, el desafío se juega sin ellas.
      localStorage.setItem('riftfall.progress', JSON.stringify({ cores: 0, talents: { hull: 5, power: 5 } }));
    });
    await page.goto('http://127.0.0.1:4178/');
    await expect(page.locator('#dcNum')).toHaveText(`#${n}`);
    await expect(page.locator('#dcInfo')).toContainText('misma partida');
    await page.click('#dcPlay');
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hudRift')).toHaveText(`DESAFÍO #${n}`);
    const cfg = await page.evaluate(() => {
      const s = window.__RIFTFALL__.game.sim;
      return { seed: s.seed, ship: s.shipKey, rift: s.rift, talents: s.talents };
    });
    expect(cfg).toEqual({ seed: dailySeed(n), ship: 'spark', rift: 1, talents: {} });

    await page.evaluate(() => window.__RIFTFALL__.fastForward(40));
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#goRewardList')).toContainText(`Desafío #${n}`);
    await page.click('#shareBtn');
    await page.waitForFunction(() => window.__shared !== null);
    expect(await page.evaluate(() => window.__shared)).toContain(`Desafío #${n}`);

    // "Jugar otra vez" repite el desafío y el menú muestra la mejor marca.
    await page.click('#againBtn');
    await expect(page.locator('#hudRift')).toHaveText(`DESAFÍO #${n}`);
    expect(await page.evaluate(() => window.__RIFTFALL__.game.sim.seed)).toBe(dailySeed(n));
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await page.click('#menuBtn');
    await expect(page.locator('#dcInfo')).toContainText('Tu mejor de hoy');
    await expect(page.locator('#dcInfo')).toContainText('2 intentos');
    // Ganar el desafío no desbloquea niveles del Rift.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.progress')).riftMax)).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('versión para portales (CrazyGames): sin cripto, revivir y x2 Núcleos con anuncios, anuncio entre partidas', async ({ browser }) => {
  const { execSync } = await import('node:child_process');
  // Copia de prueba del build del portal con el gancho de pruebas (el build real no lo tiene).
  // Se sube como un único index.html (CrazyGames no acepta ZIP).
  execSync('npx vite build --mode portal --outDir dist-portal-e2e', { stdio: 'ignore', env: { ...process.env, VITE_E2E_HOOK: '1' } });
  execSync('node scripts/inline-portal.mjs dist-portal-e2e dist-portal-e2e/single', { stdio: 'ignore' });
  const DIST = path.resolve('dist-portal-e2e/single');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };
  // El portal publica el juego dentro de una subcarpeta.
  const site = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = url.pathname.replace(/^\/juegos\/riftfall\//, '/');
    const file = path.join(DIST, rel === '/' ? 'index.html' : rel);
    if (!url.pathname.startsWith('/juegos/riftfall/') || !file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => site.listen(4179, '127.0.0.1', r));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  // SDK simulado: anota las llamadas y "muestra" cada anuncio completo.
  await ctx.route('https://sdk.crazygames.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `window.__cg = [];
        window.CrazyGames = { SDK: {
          init: async () => {},
          environment: 'crazygames',
          game: {
            loadingStart: () => __cg.push('loadingStart'), loadingStop: () => __cg.push('loadingStop'),
            gameplayStart: () => __cg.push('gameplayStart'), gameplayStop: () => __cg.push('gameplayStop'),
            happytime: () => __cg.push('happytime')
          },
          ad: { requestAd: (type, cb) => { __cg.push('ad:' + type); setTimeout(() => { cb.adStarted(); setTimeout(cb.adFinished, 50); }, 50); }, hasAdblock: async () => false },
          // Cuenta del portal con progreso de otro dispositivo.
          data: (() => {
            const m = new Map([['riftfall.progress', JSON.stringify({ cores: 777, lifetimeCores: 777 })], ['riftfall.tutorial', '1']]);
            window.__cgData = m;
            return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), clear: () => m.clear() };
          })()
        } };`
    })
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Todo va dentro del index.html: ningún pedido a otros archivos del juego.
  page.on('response', (r) => r.url().includes('/juegos/riftfall/') && r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  const calls = () => page.evaluate(() => window.__cg);
  try {
    await page.goto('http://127.0.0.1:4179/juegos/riftfall/');
    await expect(page.locator('#playBtn')).toHaveText('PLAY');
    // Nada de wallet, pagos, mercado ni Arena.
    for (const sel of ['#walletBtn', '#founderBanner', '[data-open="arena"]', '[data-open="market"]', '[data-open="vault"]']) {
      await expect(page.locator(sel)).toBeHidden();
    }
    await expect(page.locator('.tagline')).toContainText('Rift Heart');
    await expect.poll(calls).toContain('loadingStop');
    // El progreso guardado en la cuenta del portal se carga al arrancar.
    await expect(page.locator('#menuCores')).toHaveText('777');

    await page.click('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    await expect.poll(calls).toContain('gameplayStart');
    await page.evaluate(() => window.__RIFTFALL__.fastForward(20));

    // Cae: se ofrece revivir; con el anuncio completo, vuelve a la partida con medio casco.
    await page.evaluate(() => {
      const p = window.__RIFTFALL__.game.sim.player;
      p.invuln = 0;
      p.hp = -1;
    });
    await expect(page.locator('#revive')).toBeVisible();
    await page.click('#reviveAd');
    await expect(page.locator('#revive')).toBeHidden();
    const after = await page.evaluate(() => {
      const s = window.__RIFTFALL__.game.sim;
      return { phase: s.phase, hp: s.player.hp / s.player.stats.maxHp, mode: window.__RIFTFALL__.game.mode };
    });
    expect(after).toEqual({ phase: 'running', hp: 0.5, mode: 'play' });
    expect(await calls()).toContain('ad:rewarded');

    // Segunda caída: ya no se ofrece; fin de partida con la opción de duplicar Núcleos.
    await page.evaluate(() => {
      const p = window.__RIFTFALL__.game.sim.player;
      p.invuln = 0;
      p.hp = -1;
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#revive')).toBeHidden();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.progress')).cores);
    await expect(page.locator('#doubleBtn')).toBeVisible();
    await page.click('#doubleBtn');
    await expect(page.locator('#doubleBtn')).toBeHidden();
    const doubled = await page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.progress')).cores);
    expect(doubled).toBeGreaterThan(before);
    expect(before).toBeGreaterThan(777);
    // Y cada cambio vuelve a la cuenta del portal.
    expect(await page.evaluate(() => JSON.parse(window.__cgData.get('riftfall.progress')).cores)).toBe(doubled);

    // Compartir no enlaza a otra web; la próxima partida pasa por un anuncio entre partidas.
    await page.click('#againBtn');
    await expect(page.locator('#hud')).toBeVisible();
    expect((await calls()).filter((c) => c === 'ad:midgame')).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('Taller: comprar una caja con Núcleos, equipar la pieza y jugar con ella', async ({ browser }) => {
  const site = await staticSite(4180);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' });
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('riftfall.progress', JSON.stringify({ cores: 130 }));
      }
    });
    await page.goto('http://127.0.0.1:4180/');
    await page.click('[data-open="workshop"]');
    await expect(page.locator('#sheetTitle')).toHaveText('Taller');
    await expect(page.locator('.ws-part:not(.locked):not(.original)')).toHaveCount(0);
    await page.click('text=Abrir caja');
    await expect(page.locator('.toast').last()).toContainText('Nueva pieza');
    const owned = page.locator('.ws-part:not(.locked):not(.original)');
    await expect(owned).toHaveCount(1);
    // La caja costó 120 Núcleos y ya no alcanza para otra.
    await expect(page.locator('.ws-crate')).toContainText('10 ✦');
    await expect(page.locator('.ws-crate button')).toBeDisabled();
    await owned.click();
    await expect(page.locator('.ws-part.on:not(.original)')).toHaveCount(1);
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.progress')));
    const [slot, id] = Object.entries(progress.loadout)[0];
    expect(progress.parts[id]).toBe(1);

    await page.click('#sheetClose');
    await page.click('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    const parts = await page.evaluate(() => window.__RIFTFALL__.game.sim.parts);
    expect(parts).toEqual({ [slot]: { id, lv: 1 } });
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});
