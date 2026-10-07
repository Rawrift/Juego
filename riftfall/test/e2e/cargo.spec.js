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

test('Hangar Rift: naves exclusivas con plano, construir con créditos y evolucionar a Mk II', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // El jugador ya tiene el plano de la Raya (comprado antes en este navegador).
  await page.addInitScript(() => localStorage.setItem('riftcargo.style', JSON.stringify({ bought: [{ item: 'ship-raya' }], sign: '', pending: [] })));
  await page.goto('/cargo/');
  await expect(page.locator('.stage-canvas')).toBeVisible();
  await skipTutorial(page);
  await page.evaluate(() => Object.assign(window.__CARGO__.state, { level: 6, credits: 1e6 }) && (window.__CARGO__.state.up.hangar = 2));
  await page.locator('#tabs [data-v="fleet"]').click();
  // La tienda muestra las 12 naves por clase; las exclusivas sin plano piden ir al Hangar.
  await expect(page.locator('.buyship')).toHaveCount(12);
  await expect(page.locator('.buyship.excl')).toHaveCount(9);
  await page.locator('.hg-cta').click();
  await expect(page.locator('.modal-card.hangar')).toBeVisible();
  await expect(page.locator('.hg-card')).toHaveCount(4);
  // Una sin plano: se ve el precio y los botones de pago.
  await page.locator('[data-act="hgCls"][data-v="medium"]').click();
  await page.locator('[data-act="hgModel"][data-v="bisonte"]').click();
  await expect(page.locator('.modal-card.hangar [data-act="styBuy"][data-v="ship-bisonte"][data-m="usdt"]')).toContainText('5');
  // Cómo queda evolucionada.
  await page.locator('[data-act="hgEvo"][data-v="2"]').click();
  await expect(page.locator('[data-act="hgEvo"][data-v="2"]')).toHaveClass(/on/);
  // Con el plano, se construye con créditos.
  await page.locator('[data-act="hgModel"][data-v="raya"]').click();
  await page.locator('.modal-card.hangar [data-act="buyShip"]').click();
  await expect.poll(() => page.evaluate(() => window.__CARGO__.state.ships.filter((x) => x.model === 'raya').length)).toBe(1);
  await page.screenshot({ path: 'test-results/cargo-hangar.png' });
  await page.locator('.modal-card.hangar [data-act="closeModal"]').click();
  // Evolucionar la nave desde su tarjeta.
  const id = await page.evaluate(() => window.__CARGO__.state.ships.find((x) => x.model === 'raya').id);
  await page.locator(`.ship[data-v="${id}"]`).click();
  await page.locator('#detail [data-act="evolve"]').click();
  await expect.poll(() => page.evaluate((i) => window.__CARGO__.state.ships.find((x) => x.id === i).evo, id)).toBe(1);
  await expect(page.locator('#detail')).toContainText('Mk 2');
  expect(errors).toEqual([]);
});

test('Ruta Rift: quien ya jugó RIFTFALL recibe créditos en Rift Cargo (una sola vez)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('riftfall.progress', JSON.stringify({ runs: 2, bestScore: 900 })));
  await page.goto('/cargo/');
  await expect(page.locator('.stage-canvas')).toBeVisible();
  await expect(page.locator('.toast.ok').filter({ hasText: 'Ruta Rift' })).toBeVisible();
  expect(await page.evaluate(() => window.__CARGO__.state.credits)).toBe(3000 + 2500);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  expect(await page.evaluate(() => window.__CARGO__.state.credits)).toBe(5500);
  // El menú invita al próximo escalón.
  await page.evaluate(() => (window.__CARGO__.state.flags.tut = 99) && (document.querySelector('#coach').hidden = true));
  await page.locator('.profile').click();
  await expect(page.locator('#menu a[href="/"]')).toContainText('$10.000');
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

test('Taller de estilo: se prueba la pintura, se paga en USDT verificado en la cadena y se restaura por hash', async ({ page }) => {
  test.setTimeout(400_000); // la escena 3D en el navegador de pruebas (sin GPU) es lenta
  const PAYER = '0x1111111111111111111111111111111111111111';
  const TREASURY = '0x09aF2acF700d6Be84009655fB814a5311DAEc7Dd';
  const USDT = '0x55d398326f99059fF775485246999027B3197955';
  const HASH = `0x${'ab'.repeat(32)}`;
  const pad = (a) => `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
  const word = (n) => BigInt(n).toString(16).padStart(64, '0');
  const twoUsdt = 2n * 10n ** 18n;
  const tag = Buffer.from('RCS:liv-aurora').toString('hex');
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

  // Red principal simulada: BNB a 600 USD y el pago de 2 USDT (con la etiqueta de la pintura) ya minado.
  const tx = { hash: HASH, from: PAYER, to: USDT, value: '0x0', input: `0xa9059cbb${pad(TREASURY).slice(2)}${word(twoUsdt)}${tag}` };
  const receipt = {
    transactionHash: HASH, status: '0x1',
    logs: [{ address: USDT, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad(PAYER), pad(TREASURY)], data: `0x${word(twoUsdt)}` }]
  };
  const answer = (req) => ({
    eth_call: `0x${word(600_000n * 10n ** 18n)}${word(1000n * 10n ** 18n)}${word(1)}`,
    eth_getTransactionByHash: tx,
    eth_getTransactionReceipt: receipt
  })[req.method] ?? null;
  await page.context().route((u) => u.hostname === 'bsc-rpc.publicnode.com', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: answer(body) }) });
  });

  const openWorkshop = async () => {
    await skipTutorial(page);
    await page.click('#tabs [data-v="fleet"]');
    await page.click('.sty-cta[data-act="style"]');
    await expect(page.locator('.modal-card.style')).toBeVisible();
  };
  await page.goto('/cargo/');
  await page.locator('.tut-target').waitFor();
  await openWorkshop();

  // Probar antes de comprar: la pintura se ve en la vista previa y aparece su precio.
  const aurora = page.locator('[data-act="styLiv"][data-v="aurora"]');
  await expect(aurora).toHaveClass(/lock/);
  await aurora.click();
  await expect(page.locator('.sty-buy').first()).toContainText('Comprar Pintura Aurora');
  await expect(page.locator('.sty-buy').first()).toContainText('Pagar 0,003334 BNB');
  expect(await page.evaluate(() => window.__CARGO__.state.ships[0].look)).toBeUndefined();

  await page.locator('.sty-buy').first().locator('text=Pagar US$ 2 en USDT').click();
  await expect(page.locator('.toast').first()).toContainText('Pintura Aurora ya es tuyo', { timeout: 20_000 });

  // Se pidió una sola transferencia de 2 USDT a la wallet del creador, en la red principal, con la etiqueta.
  const sent = await page.evaluate(() => window.__sent);
  expect(sent).toHaveLength(1);
  expect(sent[0].chain).toBe('0x38');
  expect(sent[0].to.toLowerCase()).toBe(USDT.toLowerCase());
  expect(sent[0].data).toBe(tx.input);

  // La nave quedó pintada (también la malla 3D de la estación) y se guarda.
  await expect(aurora).toHaveClass(/has/);
  await expect(aurora).toContainText('En uso');
  const id = await page.evaluate(() => window.__CARGO__.state.ships[0].id);
  expect(await page.evaluate(() => window.__CARGO__.state.ships[0].look.livery)).toBe('aurora');
  await expect.poll(() => page.evaluate((i) => window.__CARGO__.station.ships.get(i)?.key, id)).toContain('aurora');

  // Lo que no compró sigue bloqueado; la matrícula propia muestra su precio.
  await expect(page.locator('[data-act="styLiv"][data-v="carbono"]')).toHaveClass(/lock/);
  await expect(page.locator('#styPlate')).toHaveCount(0);

  // Pase Fundador Oro (de RIFTFALL, mismo sitio): regala la pintura dorada y la matrícula.
  await page.evaluate(() => localStorage.setItem('riftfall.founder', JSON.stringify({ tier: 'gold', tx: '0x1' })));
  await page.click('[data-act="closeModal"]');
  await openWorkshop();
  await expect(page.locator('[data-act="styLiv"][data-v="fundador"]')).toHaveClass(/has/);
  await page.fill('#styPlate', 'La Ñandú');
  await page.click('[data-act="styPlate"]');
  await expect(page.locator('.sty-plate')).toHaveText('LA NANDU');
  await expect.poll(() => page.evaluate((i) => window.__CARGO__.station.ships.get(i)?.key, id)).toContain('LA NANDU');

  // Otro dispositivo: sin datos locales, la compra se recupera con el hash del pago.
  await page.evaluate(() => {
    localStorage.removeItem('riftcargo.style');
    localStorage.removeItem('riftfall.founder');
  });
  await page.reload();
  await page.locator('.tut-target, .ops').first().waitFor();
  await openWorkshop();
  await expect(aurora).toHaveClass(/lock/);
  await page.click('.sty-restore summary');
  await page.fill('#styHash', 'basura');
  await page.click('[data-act="styRestore"]');
  await expect(page.locator('.toast').first()).toContainText('Ese hash no es válido');
  await page.fill('#styHash', HASH);
  await page.click('[data-act="styRestore"]');
  await expect(page.locator('.toast').first()).toContainText('Compra verificada: Pintura Aurora');
  await expect(aurora).toHaveClass(/has/);

  // Pago enviado pero la página se cerró antes de confirmar: al volver se verifica solo.
  await page.evaluate((h) => localStorage.setItem('riftcargo.style', JSON.stringify({ bought: [], sign: '', pending: [h] })), HASH);
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('riftcargo.style'))), { timeout: 30_000 })
    .toMatchObject({ bought: [{ item: 'liv-aurora', tx: HASH }], pending: [] });
  expect(errors).toEqual([]);
});

test('celular sin wallet: pagar pide conectar la wallet y, si no anda, abre el juego en MetaMask con la partida y los estéticos', async ({ browser }) => {
  test.setTimeout(300_000);
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' };
  const phone = await browser.newPage(opts);
  // Chrome del celular: WalletConnect muestra el código para conectar (simulado: nunca responde, así se usa el plan B).
  await phone.addInitScript(() => {
    const on = {};
    window.__wcFake = {
      session: null,
      on: (ev, fn) => (on[ev] = fn),
      connect: () => (on.display_uri?.('wc:prueba@2'), new Promise(() => {})),
      request: async () => null
    };
  });
  await phone.goto('/cargo/');
  await phone.locator('.mtabs').waitFor();
  await skipTutorial(phone);
  // Progreso propio y una compra hecha antes.
  await phone.evaluate(() => {
    const s = window.__CARGO__.state;
    s.credits = 54321;
    s.stats.earned = 98765;
    s.ships[0].look = { livery: 'carbono', trail: 'cian' };
    localStorage.setItem('riftcargo.style', JSON.stringify({ bought: [{ item: 'liv-carbono', tx: `0x${'cd'.repeat(32)}`, payer: '0x1', usd: 2, method: 'usdt', at: 1 }], sign: '' }));
  });
  let link = null;
  await phone.context().route((u) => u.hostname === 'metamask.app.link', async (route) => {
    link = route.request().url();
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>MetaMask</p>' });
  });
  await phone.locator('.mtabs [data-v="fleet"]').tap();
  await phone.locator('.sty-cta[data-act="style"]').tap();
  await phone.locator('[data-act="styTrail"][data-v="magenta"]').tap();
  await phone.locator('.sty-buy').first().locator('text=Pagar US$ 1 en USDT').tap();
  // Se pide conectar la wallet; si no anda, el plan B abre el juego dentro de MetaMask.
  await expect(phone.locator('.ra-mm [data-app="metamask"]').first()).toHaveAttribute('href', 'metamask://wc?uri=wc%3Aprueba%402');
  await phone.locator('.ra-mm [data-mm="inside"]').tap();
  // Ventana "Abrir en MetaMask": el jugador toca el link (así iOS abre la app y no la App Store).
  const open = phone.locator('.ra-mm [data-mm="open"]');
  await expect(open).toHaveText('Abrir en MetaMask');
  expect(link).toBeNull();
  await open.tap();
  await expect.poll(() => link, { timeout: 20_000 }).toBeTruthy();
  const url = new URL(link);
  expect(url.pathname).toMatch(/^\/dapp\/127\.0\.0\.1:\d+\/cargo\/$/);
  const pack = url.searchParams.get('rf');
  expect(pack).toBeTruthy();
  await phone.close();

  // El navegador de MetaMask (memoria vacía) abre el link: llega todo.
  const mm = await browser.newPage(opts);
  await mm.goto(`/cargo/?rf=${pack}`);
  await mm.locator('.mtabs').waitFor();
  const got = await mm.evaluate(() => ({
    credits: Math.round(window.__CARGO__.state.credits),
    earned: window.__CARGO__.state.stats.earned,
    look: window.__CARGO__.state.ships[0].look,
    style: JSON.parse(localStorage.getItem('riftcargo.style')),
    search: location.search
  }));
  expect(got.credits).toBeGreaterThanOrEqual(54321);
  expect(got.earned).toBeGreaterThanOrEqual(98765);
  expect(got.look).toEqual({ livery: 'carbono', trail: 'cian' });
  expect(got.style.bought.map((b) => b.item)).toEqual(['liv-carbono']);
  expect(got.search).toBe('');
  await mm.close();
});
