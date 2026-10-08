import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Wallet } from 'ethers';
import { makeOrder } from '../../src/shared/purchase-order.js';
import { riftSite } from './purchase-site.mjs';

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
async function staticSite(port, { deployment = null } = {}) {
  const DIST = path.resolve('dist-e2e');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
  const site = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // Sin token desplegado (salvo que la prueba pase uno): modo práctica puro.
    if (url.pathname === '/deployment.json') {
      if (deployment) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(deployment));
      }
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

test('Pase Fundador: pedido USDT reconocido por el servidor, pintura dorada y restauración por hash', async ({ page }) => {
  const wallet = Wallet.createRandom();
  const PAYER = wallet.address.toLowerCase();
  const TREASURY = '0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd';
  const USDT = '0x55d398326f99059fF775485246999027B3197955';
  const HASH = `0x${'ab'.repeat(32)}`;
  let order;
  const site = await riftSite(4198, {}, {
    quote: async (details) => (order = makeOrder({ ...details, bnbUsd: 800 })),
    payment: async (hash) => hash === HASH && order ? {
      kind: order.kind, item: order.item, payer: order.payer, usd: order.usd, method: order.method, orderId: order.id
    } : { kind: null, reason: 'notFound' }
  });
  try {
  await page.exposeBinding('testSign', (_src, msg) => wallet.signMessage(msg));
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
        if (method === 'personal_sign') return window.testSign(new TextDecoder().decode(Uint8Array.from(params[0].slice(2).match(/../g), (h) => parseInt(h, 16))));
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
      case 'eth_getTransactionByHash': return { ...tx, input: order?.data ?? tx.input };
      case 'eth_getTransactionReceipt': return receipt;
      default: return null;
    }
  };
  await page.context().route((u) => u.hostname === 'bsc-rpc.publicnode.com', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const out = Array.isArray(body) ? body.map((r) => ({ jsonrpc: '2.0', id: r.id, result: answer(r) })) : { jsonrpc: '2.0', id: body.id, result: answer(body) };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });

  await page.goto(site.url);
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
  expect(sent[0].data).toBe(order.data);

  await expect(page.locator('#founderChip')).toBeVisible();
  await expect(page.locator('.founder-status')).toContainText('Eres Fundador Oro');
  await expect(page.locator('.tier-pilot .tier-owned')).toBeVisible();
  await page.click('.skin-row >> text=Dorada');
  expect(await page.evaluate(() => window.__RIFTFALL__.renderer.R.skin)).toBe('founder');
  expect(await page.evaluate(() => window.__RIFTFALL__.renderer.R.trailColor)).toBe('#ffd23d');

  // Borrar el registro local no borra la compra reconocida en la cuenta.
  await page.evaluate(() => {
    localStorage.removeItem('riftfall.founder');
    localStorage.removeItem('riftfall.skin');
  });
  await page.reload();
  await expect(page.locator('#founderChip')).toBeVisible();
  await page.click('#founderBanner');
  await page.fill('.hash-input', 'basura');
  await page.click('text=Verificar pago');
  await expect(page.locator('.toast').last()).toContainText('no es un hash de transacción válido');
  await page.fill('.hash-input', HASH);
  await page.click('text=Verificar pago');
  await expect(page.locator('.founder-status')).toContainText('Eres Fundador Oro');
  await expect(page.locator('#founderChip')).toBeVisible();
  expect(errors).toEqual([]);
  } finally { site.close(); }
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
  execSync('npx vite build --mode portal --outDir dist-portal-e2e', { stdio: 'ignore', env: { ...process.env, VITE_E2E_HOOK: '1', VITE_PORTAL_ADS: '1' } });
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
  const sdkMock = (route) =>
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
            happytime: () => __cg.push('happytime'),
            settings: { muteAudio: false },
            addSettingsChangeListener: (fn) => (window.__cgSettings = fn)
          },
          ad: { requestAd: (type, cb) => { __cg.push('ad:' + type); setTimeout(() => { cb.adStarted(); setTimeout(cb.adFinished, 50); }, 50); }, hasAdblock: async () => false },
          // Cuenta del portal con progreso de otro dispositivo.
          data: (() => {
            const m = location.search.includes('nuevo')
              ? new Map()
              : new Map([['riftfall.progress', JSON.stringify({ cores: 777, lifetimeCores: 777, runs: 4 })], ['riftfall.tutorial', '1']]);
            window.__cgData = m;
            return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), clear: () => m.clear() };
          })()
        } };`
    });
  await ctx.route('https://sdk.crazygames.com/**', sdkMock);
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
    // El botón de silencio del portal manda sobre el sonido del juego.
    expect(await page.evaluate(() => window.__RIFTFALL__.audio.silent)).toBe(false);
    await page.evaluate(() => window.__cgSettings({ muteAudio: true }));
    expect(await page.evaluate(() => window.__RIFTFALL__.audio.silent)).toBe(true);
    await page.evaluate(() => window.__cgSettings({ muteAudio: false }));
    expect(await page.evaluate(() => window.__RIFTFALL__.audio.silent)).toBe(false);

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

    // Un jugador nuevo entra directo a la partida, sin tocar nada.
    const fresh = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
    try {
      await fresh.route('https://sdk.crazygames.com/**', sdkMock);
      const p2 = await fresh.newPage();
      await p2.goto('http://127.0.0.1:4179/juegos/riftfall/?nuevo');
      await expect(p2.locator('#hud')).toBeVisible();
      await expect(p2.locator('#menu')).toBeHidden();
      await expect.poll(() => p2.evaluate(() => window.__cg)).toContain('gameplayStart');
    } finally {
      await fresh.close();
    }
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

test('Duelo con amigos: link con semilla y marca, mismo mapa con reglas parejas, resultado y devolver el reto', async ({ browser }) => {
  const { encodeDuel, decodeDuel } = await import('../../src/shared/duel.js');
  const seed = 123_456_789;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES', baseURL: 'http://127.0.0.1:4174' });
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // El duelo no pide partidas al servidor aunque esté en línea.
    const runStarts = [];
    page.on('request', (r) => r.url().includes('/api/run/start') && runStarts.push(r.url()));
    await page.addInitScript(() => {
      window.__shared = null;
      navigator.canShare = () => false;
      navigator.share = async (data) => {
        window.__shared = data;
      };
      // Aunque tenga habilidades, el duelo se juega sin ellas.
      if (!localStorage.getItem('riftfall.progress')) localStorage.setItem('riftfall.progress', JSON.stringify({ cores: 0, talents: { hull: 5, power: 5 } }));
    });
    await page.goto(`/?duel=${encodeDuel({ seed, score: 98_765, timeSec: 400, kills: 500, victory: false, name: 'Ana' })}`);
    await expect(page.locator('#duelInvite')).toBeVisible();
    await expect(page.locator('#duelFrom')).toHaveText('⚔ Ana te retó a un duelo');
    await expect(page.locator('#duelMark')).toContainText('06:40');

    await page.click('#duelAccept');
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hudRift')).toHaveText('DUELO');
    const cfg = await page.evaluate(() => {
      const s = window.__RIFTFALL__.game.sim;
      return { seed: s.seed, ship: s.shipKey, rift: s.rift, talents: s.talents };
    });
    expect(cfg).toEqual({ seed, ship: 'spark', rift: 0, talents: {} });

    await page.evaluate(() => window.__RIFTFALL__.fastForward(20));
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#goDuel')).toBeVisible();
    await expect(page.locator('#goDuelResult')).toContainText('Ana te ganó por');
    await expect(page.locator('#duelSend')).toHaveText('⚔ DEVOLVER EL RETO');
    await expect(page.locator('#againBtn')).toHaveText('MISMO MAPA');

    // Devolver el reto: el link lleva la misma semilla, mi marca y mi nombre.
    await page.fill('#duelName', 'Rodri 🚀');
    await page.click('#duelSend');
    await page.waitForFunction(() => window.__shared !== null);
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.text).toContain('Te reto a un duelo');
    const back = decodeDuel(new URL(shared.url).searchParams.get('duel'));
    const myScore = Number((await page.locator('#goStats div:last-child b').textContent()).replace(/\D/g, ''));
    expect(back).toMatchObject({ seed, name: 'Rodri 🚀', score: myScore });

    // Revancha en el mismo mapa.
    await page.click('#againBtn');
    await expect(page.locator('#hudRift')).toHaveText('DUELO');
    expect(await page.evaluate(() => window.__RIFTFALL__.game.sim.seed)).toBe(seed);
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });

    // Quien recibe el link de vuelta ve el reto con mi nombre.
    await page.goto(new URL(shared.url).pathname + new URL(shared.url).search);
    await expect(page.locator('#duelFrom')).toHaveText('⚔ Rodri 🚀 te retó a un duelo');

    // Un reto nuevo desde el menú: semilla nueva y sin rival.
    await page.goto('/');
    await expect(page.locator('#duelInvite')).toBeHidden();
    await page.click('#duelPlay');
    await expect(page.locator('#hudRift')).toHaveText('DUELO');
    expect(await page.evaluate(() => window.__RIFTFALL__.game.sim.seed)).not.toBe(seed);
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#goDuelResult')).toContainText('Envía el link');
    await expect(page.locator('#duelSend')).toHaveText('⚔ RETAR A UN AMIGO');
    await expect(page.locator('#duelName')).toHaveValue('Rodri 🚀');
    // Las partidas normales no muestran el duelo.
    await page.click('#menuBtn');
    await page.click('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#goDuel')).toBeHidden();
    await expect(page.locator('#againBtn')).toHaveText('JUGAR OTRA VEZ');
    expect(runStarts).toHaveLength(1);

    // Un link editado a mano avisa y no muestra el reto.
    const code = encodeDuel({ seed, score: 10, timeSec: 10, kills: 1, victory: false, name: 'X' }).split('.');
    code[2] = 'zzzz';
    await page.goto(`/?duel=${code.join('.')}`);
    await expect(page.locator('#toasts')).toContainText('modificado');
    await expect(page.locator('#duelInvite')).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('wallet: MetaMask se conecta sin recargar la página, sigue conectada al recargar y se elige entre varias wallets', async ({ browser }) => {
  const deployment = JSON.parse(fs.readFileSync('public/deployment.json', 'utf8'));
  const site = await staticSite(4182, { deployment });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' });
  // Red de pruebas simulada: saldos en cero.
  await ctx.route('https://bsc-testnet-rpc.publicnode.com/**', (r) => {
    const body = JSON.parse(r.request().postData());
    const one = (q) => ({ jsonrpc: '2.0', id: q.id, result: q.method === 'eth_chainId' ? '0x61' : `0x${'0'.repeat(64)}` });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)) });
  });
  await ctx.addInitScript(() => {
    const n = Number(sessionStorage.getItem('loads') ?? 0) + 1;
    sessionStorage.setItem('loads', String(n));
    // Otra extensión se quedó con window.ethereum: no debe usarse si MetaMask se anuncia.
    window.ethereum = { request: async () => { throw new Error('se usó la wallet equivocada'); }, on() {} };
    // MetaMask, con su estado guardado entre recargas (como la extensión real).
    const st = JSON.parse(sessionStorage.getItem('mm') ?? '{"chain":"0x38","authorized":false,"pendingOnce":true,"requests":0}');
    const save = () => sessionStorage.setItem('mm', JSON.stringify(st));
    const ls = {};
    // La extensión avisa de los cambios un rato después de responder.
    const emit = (ev, v) => setTimeout(() => (ls[ev] ?? []).forEach((f) => f(v)), 600);
    const ACC = '0x09af2acf700d6be84009655fb814a5311daec7dd';
    const provider = {
      isMetaMask: true,
      on: (ev, fn) => (ls[ev] ??= []).push(fn),
      removeListener() {},
      async request({ method, params }) {
        await new Promise((r) => setTimeout(r, 30));
        switch (method) {
          case 'eth_requestAccounts':
            st.requests++;
            save();
            if (st.pendingOnce) {
              st.pendingOnce = false;
              save();
              throw Object.assign(new Error("Request of type 'wallet_requestPermissions' already pending"), { code: -32002 });
            }
            if (!st.authorized) {
              st.authorized = true;
              save();
              emit('accountsChanged', [ACC]);
            }
            return [ACC];
          case 'eth_accounts':
            return st.authorized ? [ACC] : [];
          case 'eth_chainId':
            return st.chain;
          case 'net_version':
            return String(parseInt(st.chain, 16));
          case 'wallet_switchEthereumChain':
            st.chain = params[0].chainId;
            save();
            emit('chainChanged', st.chain);
            return null;
          case 'wallet_watchAsset':
            return true;
          default:
            throw Object.assign(new Error(`no soportado: ${method}`), { code: 4200 });
        }
      }
    };
    window.__mmEmit = (ev, v) => (ls[ev] ?? []).forEach((f) => f(v));
    const announce = () =>
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: 'mm', name: 'MetaMask', icon: '', rdns: 'io.metamask' }, provider }) }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Durante una recarga la página no responde: se reintenta.
  const loads = () => page.evaluate(() => Number(sessionStorage.getItem('loads'))).catch(() => 0);
  try {
    await page.goto('http://127.0.0.1:4182/');
    await expect(page.locator('#walletBtn')).toHaveText('Conectar wallet');

    // Una ventana de MetaMask quedó abierta: se explica qué hacer.
    await page.click('#walletBtn');
    await expect(page.locator('#toasts')).toContainText('ventana abierta');
    await expect(page.locator('#walletBtn')).toHaveText('Conectar wallet');

    // Segundo intento: conecta, cambia a la red del juego y no recarga cuando MetaMask avisa después.
    await page.click('#walletBtn');
    await expect(page.locator('#walletBtn')).toHaveText('0x09aF…c7Dd');
    await page.waitForTimeout(1500);
    expect(await loads()).toBe(1);
    await expect(page.locator('#walletBtn')).toHaveText('0x09aF…c7Dd');

    // Al recargar sigue conectada, sin volver a abrir MetaMask.
    await page.reload();
    await expect(page.locator('#walletBtn')).toHaveText('0x09aF…c7Dd');
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('mm')).requests)).toBe(2);

    // Un cambio de cuenta de verdad sí recarga.
    await page.evaluate(() => window.__mmEmit('accountsChanged', ['0x2222222222222222222222222222222222222222']));
    await expect.poll(loads).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('portal en Basic Launch: sin anuncios (ni revivir, ni x2, ni entre partidas)', async ({ browser }) => {
  const { execSync } = await import('node:child_process');
  execSync('npx vite build --mode portal --outDir dist-portal-e2e-basic', { stdio: 'ignore', env: { ...process.env, VITE_E2E_HOOK: '1', VITE_PORTAL_ADS: '' } });
  execSync('node scripts/inline-portal.mjs dist-portal-e2e-basic dist-portal-e2e-basic/single', { stdio: 'ignore' });
  const html = fs.readFileSync('dist-portal-e2e-basic/single/index.html');
  const site = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise((r) => site.listen(4183, '127.0.0.1', r));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  await ctx.route('https://sdk.crazygames.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `window.__cg = [];
        window.CrazyGames = { SDK: {
          init: async () => {},
          game: { loadingStart() {}, loadingStop() {}, gameplayStart() { __cg.push('gameplayStart'); }, gameplayStop() {}, happytime() {}, settings: { muteAudio: false }, addSettingsChangeListener() {} },
          ad: { requestAd: (type, cb) => { __cg.push('ad:' + type); cb.adError({ code: 'other' }); } },
          data: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }
        } };`
    })
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:4183/');
    // Jugador nuevo: entra directo a la partida.
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => window.__RIFTFALL__.fastForward(10));
    await page.evaluate(() => {
      const p = window.__RIFTFALL__.game.sim.player;
      p.invuln = 0;
      p.hp = -1;
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#revive')).toBeHidden();
    await expect(page.locator('#doubleBtn')).toBeHidden();
    await page.click('#againBtn');
    await expect(page.locator('#hud')).toBeVisible();
    const calls = await page.evaluate(() => window.__cg);
    expect(calls.filter((c) => c.startsWith('ad:'))).toEqual([]);
    expect(calls.filter((c) => c === 'gameplayStart').length).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('nave NFT elegida sin wallet conectada: el menú lo avisa, al jugar se conecta y vuela con ella', async ({ browser }) => {
  const { AbiCoder, id } = await import('ethers');
  const deployment = JSON.parse(fs.readFileSync('public/deployment.json', 'utf8'));
  const site = await staticSite(4184, { deployment });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' });
  const SHIPS_OF = id('shipsOf(address)').slice(0, 10);
  // La wallet tiene la LEVIATHAN #1 en nivel 6 (clase 3 del contrato).
  const shipsOf = AbiCoder.defaultAbiCoder().encode(['uint256[]', 'uint16[]', 'uint8[]'], [[1n], [3], [6]]);
  await ctx.route('https://bsc-testnet-rpc.publicnode.com/**', (r) => {
    const body = JSON.parse(r.request().postData());
    const one = (q) => ({
      jsonrpc: '2.0',
      id: q.id,
      result: q.method === 'eth_chainId' ? '0x61' : q.method === 'eth_call' && q.params[0].data.startsWith(SHIPS_OF) ? shipsOf : `0x${'0'.repeat(64)}`
    });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)) });
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('riftfall.tutorial', '1');
    localStorage.setItem('riftfall.ship', JSON.stringify({ key: 'leviathan', tokenId: '1', level: 6 }));
    const ACC = '0x09af2acf700d6be84009655fb814a5311daec7dd';
    let authorized = false;
    window.ethereum = {
      isMetaMask: true,
      on() {},
      removeListener() {},
      async request({ method, params }) {
        switch (method) {
          case 'eth_requestAccounts':
            authorized = true;
            return [ACC];
          case 'eth_accounts':
            return authorized ? [ACC] : [];
          case 'eth_chainId':
            return '0x61';
          case 'net_version':
            return '97';
          case 'wallet_watchAsset':
            return true;
          default:
            throw Object.assign(new Error(`no soportado: ${method} ${JSON.stringify(params ?? [])}`), { code: 4200 });
        }
      }
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:4184/');
    await expect(page.locator('#walletBtn')).toHaveText('Conectar wallet');
    await expect(page.locator('#shipName')).toContainText('LEVIATHAN');
    await expect(page.locator('#shipDesc')).toHaveText('Conecta tu wallet para volar con esta nave.');

    // En el hangar se explica por qué no aparece la nave.
    await page.click('#menu [data-open="hangar"]');
    await expect(page.locator('#sheetBody')).toContainText('Conecta tu wallet para ver y usar tus naves NFT.');
    await page.keyboard.press('Escape');

    // Al jugar se conecta la wallet y la partida usa la LEVIATHAN nivel 6.
    await page.click('#playBtn');
    await expect(page.locator('#hud')).toBeVisible();
    expect(await page.evaluate(() => ({ ship: window.__RIFTFALL__.game.sim.shipKey, level: window.__RIFTFALL__.game.run.shipLevel }))).toEqual({ ship: 'leviathan', level: 6 });
    await expect(page.locator('#walletBtn')).toHaveText('0x09aF…c7Dd');
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('ranking mundial del desafío: la partida se verifica en el servidor, aparece en el menú y se puede cambiar el nombre', async ({ browser }) => {
  const { createDailyBoard } = await import('../../server/world-board.mjs');
  const store = new Map();
  let posts = 0;
  const board = createDailyBoard({ load: async (n) => store.get(n) ?? null, save: async (n, b) => store.set(n, structuredClone(b)) });
  const site = await staticSite(4185);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  // La función /api/daily de Vercel, con el mismo código y un almacenamiento en memoria.
  await ctx.route('**/api/daily**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      posts++;
      const res = await board.submit(JSON.parse(req.postData()));
      return route.fulfill({ status: res.ok ? 200 : 400, contentType: 'application/json', body: JSON.stringify(res) });
    }
    const data = await board.get(new URL(req.url()).searchParams.get('n'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept('Rodri'));
  try {
    await page.goto('http://127.0.0.1:4185/');
    await expect(page.locator('#dcWorld')).toBeVisible();
    await expect(page.locator('#wdYou')).toContainText('sé el primero');

    await page.click('#dcPlay');
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate(() => window.__RIFTFALL__.fastForward(25));
    await page.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#goRewardList')).toContainText('Puesto #1 del mundo hoy', { timeout: 20_000 });
    expect(posts).toBe(1);
    // El puntaje anotado es el que calculó el servidor al re-jugar, igual al de la partida.
    const shown = Number((await page.locator('#goStats div:last-child b').textContent()).replace(/\D/g, ''));
    const [entry] = [...store.values()][0].entries;
    expect(entry.score).toBe(shown);

    await page.click('#menuBtn');
    await expect(page.locator('#wdList li')).toHaveCount(1);
    await expect(page.locator('#wdList li.me em')).toHaveText(shown.toLocaleString('es-ES'));
    await expect(page.locator('#wdYou')).toContainText('#1');
    await page.click('#wdRename');
    await expect(page.locator('#wdRename')).toHaveText('✎ Rodri');
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('sugerencia del Pase Fundador: tras una buena partida, una vez por día y nunca a quien ya es Fundador', async ({ browser }) => {
  const site = await staticSite(4186);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('riftfall.progress')) localStorage.setItem('riftfall.progress', JSON.stringify({ cores: 0, runs: 5 }));
    localStorage.setItem('riftfall.tutorial', '1');
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const playAndQuit = async (seconds) => {
    await page.click('#againBtn:visible, #playBtn:visible');
    await expect(page.locator('#hud')).toBeVisible();
    await page.evaluate((s) => {
      const H = window.__RIFTFALL__;
      H.game.sim.player.invuln = 1e9;
      H.fastForward(s);
      H.setPaused(true);
      document.getElementById('quitBtn').click();
    }, seconds);
    await expect(page.locator('#gameover')).toBeVisible({ timeout: 10_000 });
  };
  try {
    await page.goto('http://127.0.0.1:4186/');
    // Una partida corta no la muestra.
    await playAndQuit(30);
    await expect(page.locator('#goFounder')).toBeHidden();
    // Una buena partida sí, con el botón al panel del Pase.
    await playAndQuit(130);
    await expect(page.locator('#goFounder')).toBeVisible();
    await page.click('#goFounderNo');
    await expect(page.locator('#goFounder')).toBeHidden();
    // El mismo día no se repite.
    await playAndQuit(130);
    await expect(page.locator('#goFounder')).toBeHidden();
    // Al día siguiente vuelve, y el botón abre el Pase Fundador.
    await page.evaluate(() => localStorage.setItem('riftfall.upsellDay', '2000-01-01'));
    await playAndQuit(130);
    await page.click('#goFounderBtn');
    await expect(page.locator('#sheet')).toBeVisible();
    await expect(page.locator('#sheetTitle')).toContainText('Fundador');
    // A quien ya es Fundador no se le ofrece.
    await page.evaluate(() => {
      localStorage.setItem('riftfall.upsellDay', '2000-01-01');
      localStorage.setItem('riftfall.founder', JSON.stringify({ tier: 'pilot', tx: '0x1' }));
    });
    await page.keyboard.press('Escape');
    await playAndQuit(130);
    await expect(page.locator('#goFounder')).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('ranking compartido: el papá juega y el hijo ve su puntaje desde otro celular', async ({ browser }) => {
  const { createRunBoard } = await import('../../server/run-board.mjs');
  let stored = null;
  let posts = 0;
  const board = createRunBoard({ load: async () => (stored ? structuredClone(stored) : null), save: async (b) => (stored = structuredClone(b)) });
  const site = await staticSite(4186);
  // La función /api/ranking de Vercel, con el mismo código y un almacenamiento en memoria (compartido por los dos celulares).
  const route = async (r) => {
    const req = r.request();
    if (req.method() === 'POST') {
      posts++;
      const res = await board.submit(JSON.parse(req.postData()));
      return r.fulfill({ status: res.ok ? 200 : 400, contentType: 'application/json', body: JSON.stringify(res) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await board.get()) });
  };
  const dadCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  const kidCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-ES' });
  await dadCtx.route('**/api/ranking**', route);
  await kidCtx.route('**/api/ranking**', route);
  try {
    const dad = await dadCtx.newPage();
    const errors = [];
    dad.on('pageerror', (e) => errors.push(e.message));
    dad.on('dialog', (d) => d.accept('Papá'));
    await dad.goto('http://127.0.0.1:4186/');
    await expect(dad.locator('#rankCard')).toBeVisible();
    await expect(dad.locator('#rkYou')).toContainText('primera');
    await dad.click('#rkRename');
    await expect(dad.locator('#rkRename')).toHaveText('✎ Papá');
    await dad.click('#playBtn');
    await expect(dad.locator('#hud')).toBeVisible();
    await dad.evaluate(() => window.__RIFTFALL__.fastForward(25));
    await dad.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(dad.locator('#gameover')).toBeVisible({ timeout: 10_000 });
    await expect(dad.locator('#goRewardList')).toContainText('Puesto #1 del ranking de hoy', { timeout: 20_000 });
    expect(posts).toBe(1);
    const shown = Number((await dad.locator('#goStats div:last-child b').textContent()).replace(/\D/g, ''));
    expect(stored.today[0].score).toBe(shown);
    expect(errors).toEqual([]);

    // El hijo, en su celular, ve el puntaje del papá en el menú y en el ranking completo.
    const kid = await kidCtx.newPage();
    await kid.goto('http://127.0.0.1:4186/');
    await expect(kid.locator('#rkList li').first()).toContainText('Papá');
    await expect(kid.locator('#rkList li').first()).toContainText(shown.toLocaleString('es-ES'));
    await kid.locator('#rankCard [data-open="ranking"]').click();
    await expect(kid.locator('#sheetBody table')).toContainText('Papá');
    await kid.screenshot({ path: 'test-results/riftfall-ranking-hijo.png' });
  } finally {
    await dadCtx.close();
    await kidCtx.close();
    site.close();
  }
});

test('MetaMask en el celular: al conectar la wallet el progreso viaja al navegador de MetaMask', async ({ browser }) => {
  const deployment = JSON.parse(fs.readFileSync('public/deployment.json', 'utf8'));
  const site = await staticSite(4187, { deployment });
  const mobile = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'es-ES' };
  const chromeCtx = await browser.newContext(mobile);
  const progress = { cores: 250, lifetimeCores: 900, talents: { hull: 2 }, riftMax: 1, parts: {}, loadout: {}, runs: 7, bestScore: 4321, bestTime: 300, kills: 800, bosses: 2, victories: 0, streak: 2, lastDay: '', updatedAt: Date.now() };
  await chromeCtx.addInitScript((p) => {
    if (!localStorage.getItem('riftfall.progress')) {
      localStorage.setItem('riftfall.progress', JSON.stringify(p));
      localStorage.setItem('riftfall.name', 'Rodri');
      localStorage.setItem('riftfall.pid', 'cd'.repeat(16));
    }
  }, progress);
  let opened = null;
  await chromeCtx.route('https://metamask.app.link/**', (r) => {
    opened = r.request().url();
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>MetaMask</p>' });
  });
  const mmCtx = await browser.newContext(mobile);
  try {
    const page = await chromeCtx.newPage();
    await page.goto('http://127.0.0.1:4187/');
    await expect(page.locator('#menuCores')).toHaveText('250');
    await page.click('#walletBtn');
    // Se abre la ventana con el link: en iPhone la app de MetaMask solo se abre si el jugador lo toca.
    const open = page.locator('.ra-mm [data-mm="open"]');
    await expect(open).toHaveText('Abrir en MetaMask');
    await expect(page.locator('.ra-mm [data-mm="direct"]')).toHaveAttribute('href', /^metamask:\/\/dapp\/127\.0\.0\.1:4187\/\?rf=/);
    await expect(page.locator('.ra-mm [data-mm="copy"]')).toBeEnabled();
    expect(opened).toBeNull();
    await open.click();
    await expect.poll(() => opened, { timeout: 15_000 }).not.toBeNull();
    expect(opened).toContain('/dapp/127.0.0.1:4187/?rf=');

    // El navegador de MetaMask tiene la memoria vacía: con el link llega todo el progreso.
    const target = `http://${opened.split('/dapp/')[1]}`;
    const mm = await mmCtx.newPage();
    await mm.goto(target);
    await expect(mm.locator('.toast').first()).toContainText('tu progreso llegó');
    await expect(mm.locator('#menuCores')).toHaveText('250');
    const got = await mm.evaluate(() => ({ p: JSON.parse(localStorage.getItem('riftfall.progress')), name: localStorage.getItem('riftfall.name'), pid: localStorage.getItem('riftfall.pid'), url: location.href }));
    expect(got.p.bestScore).toBe(4321);
    expect(got.p.runs).toBe(7);
    expect(got.name).toBe('Rodri');
    // Sin servidor se lleva el progreso, pero el id secreto del ranking nunca viaja en el enlace.
    expect(got.pid).not.toBe('cd'.repeat(16));
    expect(got.pid).toMatch(/^[a-f0-9]{32}$/);
    expect(got.url).not.toContain('rf=');
  } finally {
    await chromeCtx.close();
    await mmCtx.close();
    site.close();
  }
});
