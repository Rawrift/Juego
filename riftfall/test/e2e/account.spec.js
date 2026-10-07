import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Wallet } from 'ethers';
import { createApi } from '../../cloud/api.mjs';
import { createD1 } from '../../cloud/d1-node.mjs';

// Cuenta Rift de punta a punta: el sitio publicado (dist-e2e) con el mismo servidor que corre en
// Cloudflare (cloud/api.mjs) y una base SQLite en memoria. Se usa "localhost" porque las passkeys
// no funcionan con direcciones IP.

async function riftSite(port, extraEnv = {}) {
  const DIST = path.resolve('dist-e2e');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  const api = createApi({ chain: { payment: async () => ({ kind: null, reason: 'notFound' }) } });
  const env = { DB: createD1(), ...extraEnv };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await api.handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
      if (process.env.RIFT_DEBUG) console.log(`[api] ${req.method} ${url.pathname}${url.search} -> ${r.status} ${String(req.headers.authorization ?? '').slice(7, 15)}`);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let file = path.join(DIST, url.pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(DIST) || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://localhost:${port}`, env, close: () => server.close() };
}

/** Wallet simulada (como MetaMask) que firma con `w`. Cuenta las firmas en window.__signs. */
async function withWallet(ctx, w) {
  await ctx.exposeBinding('testSign', async (_src, msg) => w.signMessage(msg));
  await ctx.addInitScript((address) => {
    const hex2str = (h) => new TextDecoder().decode(Uint8Array.from(h.slice(2).match(/../g).map((b) => parseInt(b, 16))));
    window.__signs = 0;
    window.ethereum = {
      isMetaMask: true,
      on() {},
      removeListener() {},
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
        if (method === 'eth_chainId') return '0x38';
        if (method === 'personal_sign') {
          window.__signs++;
          return window.testSign(hex2str(params[0]));
        }
        throw Object.assign(new Error(`no soportado: ${method}`), { code: 4200 });
      }
    };
  }, w.address);
}

const WC_URI = 'wc:prueba@2?relay-protocol=irn&symKey=abc';

/**
 * WalletConnect simulado (Chrome o Safari del celular, o la compu sin extensión): muestra el código para
 * conectar y responde cuando la prueba llama a window.__wcApprove() (como si el jugador aprobara en la
 * app de su wallet). Firma de verdad con `w`.
 */
async function withWalletApp(ctx, w) {
  await ctx.exposeBinding('testSign', async (_src, msg) => w.signMessage(msg));
  await ctx.addInitScript(({ address, uri }) => {
    const hex2str = (h) => new TextDecoder().decode(Uint8Array.from(h.slice(2).match(/../g).map((b) => parseInt(b, 16))));
    const on = {};
    const wait = () => new Promise((ok) => (window.__wcApprove = ok));
    // La conexión queda guardada en el navegador (como hace WalletConnect): al recargar sigue.
    window.__wcFake = {
      session: JSON.parse(localStorage.getItem('fake.wc') ?? 'null'),
      on(ev, fn) {
        on[ev] = fn;
      },
      async connect() {
        on.display_uri?.(uri);
        await wait();
        this.session = { namespaces: { eip155: { accounts: [`eip155:56:${address}`] } } };
        localStorage.setItem('fake.wc', JSON.stringify(this.session));
        return this.session;
      },
      async disconnect() {
        this.session = null;
        localStorage.removeItem('fake.wc');
      },
      async request({ method, params }) {
        if (method !== 'personal_sign') throw Object.assign(new Error(`no soportado: ${method}`), { code: 4200 });
        await wait();
        return window.testSign(hex2str(params[0]));
      }
    };
  }, { address: w.address, uri: WC_URI });
}

/** En la prueba no hay apps instaladas: los botones que abren una app (metamask://, trust://) se tocan sin seguir el link. */
const noAppLinks = (page) =>
  page.evaluate(() => document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && !/^https?:/.test(a.getAttribute('href'))) e.preventDefault();
  }, true));

/** Lector de huella simulado (como el de un celular). */
async function authenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
  });
  return { cdp, authenticatorId };
}

const desktop = { viewport: { width: 1440, height: 900 }, locale: 'es-ES' };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' };

test('cuenta con huella: el papá juega en la compu, entra desde el celular con su huella y tiene todo; el hijo ve su puntaje', async ({ browser }) => {
  test.setTimeout(240_000);
  const site = await riftSite(4190);
  const pc = await browser.newContext(desktop);
  const cel = await browser.newContext(phone);
  const kid = await browser.newContext(phone);
  try {
    const dad = await pc.newPage();
    const errors = [];
    dad.on('pageerror', (e) => errors.push(e.message));
    const pcAuth = await authenticator(dad);
    await dad.goto(`${site.url}/`);
    // Al entrar ya hay una cuenta de invitado (sin pedir nada).
    await expect(dad.locator('#accountBtn')).toBeVisible();
    await expect(dad.locator('#accountBtn')).toHaveClass(/guest/);
    await dad.click('#accountBtn');
    await expect(dad.locator('.ra-card')).toContainText('Invitado');
    await dad.fill('#raName', 'Papá');
    await dad.click('[data-ra="name"]');
    await expect(dad.locator('#accountBtn b')).toHaveText('Papá');
    await dad.click('[data-ra="close"]');

    // Juega una partida: va al ranking con su cuenta y el progreso sube a la nube.
    await dad.click('#playBtn');
    await expect(dad.locator('#hud')).toBeVisible();
    await dad.evaluate(() => window.__RIFTFALL__.fastForward(25));
    await dad.evaluate(() => {
      window.__RIFTFALL__.setPaused(true);
      document.getElementById('quitBtn').click();
    });
    await expect(dad.locator('#goRewardList')).toContainText('Puesto #1 del ranking de hoy', { timeout: 30_000 });
    const best = await dad.evaluate(() => window.__RIFTFALL__.app.progress.bestScore);
    expect(best).toBeGreaterThan(0);
    await expect.poll(async () => (await site.env.DB.prepare("SELECT data FROM saves WHERE game = 'riftfall'").first())?.data ?? '', { timeout: 20_000 })
      .toContain(`"bestScore":${best}`);

    // Vuelve al menú y protege la cuenta con la huella de la compu.
    await dad.click('#menuBtn');
    await dad.click('#accountBtn');
    await dad.click('[data-ra="addPasskey"]');
    await expect(dad.locator('.ra-status')).toContainText('Cuenta protegida');
    await expect(dad.locator('#accountBtn')).not.toHaveClass(/guest/);
    expect(errors).toEqual([]);

    // En el celular (la huella llega sincronizada, como con Google o iCloud) entra a la misma cuenta.
    const mobile = await cel.newPage();
    const celAuth = await authenticator(mobile);
    const { credentials } = await pcAuth.cdp.send('WebAuthn.getCredentials', { authenticatorId: pcAuth.authenticatorId });
    await celAuth.cdp.send('WebAuthn.addCredential', { authenticatorId: celAuth.authenticatorId, credential: credentials[0] });
    await mobile.goto(`${site.url}/`);
    await expect(mobile.locator('#accountBtn')).toHaveClass(/guest/);
    expect(await mobile.evaluate(() => window.__RIFTFALL__.app.progress.bestScore ?? 0)).toBe(0);
    await mobile.click('#accountBtn');
    await mobile.click('[data-ra="loginPasskey"]');
    // Recarga sola con el progreso de la cuenta.
    await expect(mobile.locator('#accountBtn b')).toHaveText('Papá', { timeout: 20_000 });
    await expect.poll(() => mobile.evaluate(() => window.__RIFTFALL__?.app.progress.bestScore ?? 0).catch(() => 0), { timeout: 20_000 }).toBe(best);
    await expect(mobile.locator('#rkList li.me')).toContainText('Papá');

    // También en Rift Cargo es la misma cuenta.
    await mobile.goto(`${site.url}/cargo/`);
    await mobile.locator('.mtabs').waitFor();
    await mobile.evaluate(() => {
      window.__CARGO__.state.flags.tut = 99;
      document.querySelector('#coach').hidden = true;
    });
    await mobile.locator('.profile').click();
    await expect(mobile.locator('#menu [data-act="account"]')).toContainText('Papá · Protegida');

    // El hijo, en su celular, ve el puntaje del papá.
    const k = await kid.newPage();
    await k.goto(`${site.url}/`);
    await expect(k.locator('#rkList li').first()).toContainText('Papá');
    await expect(k.locator('#rkList li').first()).toContainText(best.toLocaleString('es-ES'));
  } finally {
    await pc.close();
    await cel.close();
    await kid.close();
    site.close();
  }
});

test('cuenta con wallet: firmar (gratis) la suma a la cuenta y otro dispositivo entra con la misma wallet; Rift Cargo trae su partida', async ({ browser }) => {
  test.setTimeout(300_000);
  const site = await riftSite(4191);
  const w = Wallet.createRandom();
  const a = await browser.newContext(phone);
  const b = await browser.newContext(desktop);
  await withWallet(a, w);
  await withWallet(b, w);
  try {
    // Celular: juega Rift Cargo y conecta la wallet desde la Cuenta Rift.
    const p1 = await a.newPage();
    const errors = [];
    p1.on('pageerror', (e) => errors.push(e.message));
    await p1.goto(`${site.url}/cargo/`);
    await p1.locator('.mtabs').waitFor();
    await p1.evaluate(() => {
      const g = window.__CARGO__;
      g.state.flags.tut = 99;
      document.querySelector('#coach').hidden = true;
      g.state.credits = 77777;
      g.state.stats.earned = 123456;
      g.state.level = 3;
    });
    await p1.locator('.profile').click();
    await p1.locator('#menu [data-act="account"]').click();
    await expect(p1.locator('.ra-card')).toContainText('Invitado');
    await p1.click('[data-ra="wallet"]');
    await expect(p1.locator('.ra-status')).toContainText('Cuenta protegida');
    await expect(p1.locator('.ra-cred')).toContainText(w.address.slice(0, 6).toLowerCase());
    expect(await p1.evaluate(() => window.__signs)).toBe(1);
    // Una wallet cualquiera no es dueña del juego.
    await expect(p1.locator('.ra-owner')).toHaveCount(0);
    await p1.click('[data-ra="close"]');
    // Se va (la partida sube a la nube al esconder la página).
    await p1.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p1.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await site.env.DB.prepare("SELECT data FROM saves WHERE game = 'cargo'").first())?.data ?? '', { timeout: 20_000 })
      .toContain('"earned":123456');
    expect(errors).toEqual([]);

    // En la compu: entra con la misma wallet y Rift Cargo trae la partida del celular.
    const p2 = await b.newPage();
    if (process.env.RIFT_DEBUG) p2.on('console', (m) => console.log('[p2]', m.text().slice(0, 160)));
    await p2.goto(`${site.url}/cargo/`);
    await p2.locator('.profile').waitFor();
    expect(await p2.evaluate(() => window.__CARGO__.state.stats.earned)).toBe(0);
    await p2.evaluate(() => {
      window.__CARGO__.state.flags.tut = 99;
      document.querySelector('#coach').hidden = true;
    });
    await p2.locator('.profile').click();
    await p2.locator('#menu [data-act="account"]').click();
    await p2.click('[data-ra="wallet"]');
    // Entra a la cuenta del celular y la página se recarga sola con esa partida.
    await expect.poll(() => p2.evaluate(() => window.__CARGO__?.state.stats.earned ?? 0).catch(() => 0), { timeout: 90_000 }).toBe(123456);
    expect(await p2.evaluate(() => Math.round(window.__CARGO__.state.credits))).toBeGreaterThanOrEqual(77777);
  } finally {
    await a.close();
    await b.close();
    site.close();
  }
});

test('dueño: con la wallet del dueño tiene todo desbloqueado y el Panel del dueño en los dos juegos', async ({ browser }) => {
  test.setTimeout(240_000);
  const boss = Wallet.createRandom();
  const site = await riftSite(4193, { ADMIN_WALLETS: boss.address });
  const ctx = await browser.newContext(desktop);
  await withWallet(ctx, boss);
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Rift Cargo: conecta la wallet desde la Cuenta Rift y aparece el panel.
    await page.goto(`${site.url}/cargo/`);
    await page.locator('.profile').waitFor();
    await page.evaluate(() => {
      window.__CARGO__.state.flags.tut = 99;
      document.querySelector('#coach').hidden = true;
    });
    await page.locator('.profile').click();
    await expect(page.locator('#menu [data-act="owner"]')).toHaveCount(0);
    await page.locator('#menu [data-act="account"]').click();
    await expect(page.locator('.ra-owner')).toHaveCount(0);
    await expect(page.locator('#ownerBtn')).toBeHidden();
    await page.click('[data-ra="wallet"]');
    await expect(page.locator('.ra-status')).toContainText('Dueño');
    await expect(page.locator('.ra-owner')).toContainText('Panel del dueño');
    const credits = await page.evaluate(() => window.__CARGO__.state.credits);
    await page.click('[data-ra="owner:credits"]');
    await expect.poll(() => page.evaluate(() => window.__CARGO__.state.credits)).toBeGreaterThanOrEqual(credits + 100_000);
    await page.click('[data-ra="owner:level"]');
    await page.click('[data-ra="owner:upgrades"]');
    await expect.poll(() => page.evaluate(() => window.__CARGO__.state.level)).toBe(12);
    expect(await page.evaluate(() => Object.values(window.__CARGO__.state.up))).toEqual([3, 4, 4, 2, 3, 1, 1]);
    await page.click('[data-ra="close"]');
    // Un solo cartel de nivel nuevo (no once).
    await expect(page.locator('#modal h2')).toContainText('12');
    await page.click('#modal [data-act="closeModal"]');
    // La corona de la barra de arriba abre directo el Panel del dueño (y también está en el menú).
    await page.click('#ownerBtn');
    await expect(page.locator('.ra-owner')).toBeInViewport();
    // Estadísticas de jugadores: cuántos entraron, de dónde y si jugaron.
    await page.click('[data-ra="stats"]');
    await expect(page.locator('.ra-stats .ra-kpi')).toHaveCount(4);
    await expect(page.locator('.ra-stats')).toContainText('De dónde vienen');
    await expect(page.locator('.ra-stats .ra-row').first()).toBeVisible();
    await page.click('[data-ra="statsBack"]');
    await expect(page.locator('.ra-owner')).toBeVisible();
    await page.click('[data-ra="review"]');
    await expect(page.locator('#raReviewHash')).toBeVisible();
    await expect(page.locator('#raReviewItem')).toBeVisible();
    await expect(page.locator('#raReviewAmount')).toBeVisible();
    await page.screenshot({ path: 'test-results/purchase-review-owner.png', animations: 'disabled' });
    await page.click('[data-ra="statsBack"]');
    await page.click('[data-ra="close"]');
    await page.locator('.profile').click();
    await expect(page.locator('#menu [data-act="owner"]')).toContainText('Panel del dueño');
    await page.locator('.profile').click();
    // El Taller de estilo: todo es suyo (nada con candado).
    await page.locator('.profile').click();
    await page.locator('#menu [data-act="style"]').click();
    await expect(page.locator('.sw.has').first()).toBeVisible();
    await expect(page.locator('.sw.lock')).toHaveCount(0);
    // La partida con todo eso queda en la nube.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await site.env.DB.prepare("SELECT data FROM saves WHERE game = 'cargo'").first())?.data ?? '', { timeout: 20_000 })
      .toContain('"level":12');

    // RIFTFALL: misma cuenta, Pase Fundador Leyenda sin pagar y su panel.
    await page.goto(`${site.url}/`);
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.founder') ?? 'null')?.tier)).toBe('legend');
    await page.click('#accountBtn');
    await expect(page.locator('.ra-owner [data-ra^="owner:"]')).toHaveCount(4);
    for (const k of ['cores', 'talents', 'rift', 'parts']) {
      await page.click(`[data-ra="owner:${k}"]`);
      await expect(page.locator(`[data-ra="owner:${k}"]`)).toBeEnabled();
    }
    const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('riftfall.progress')));
    expect(prog.cores).toBeGreaterThanOrEqual(5000);
    expect(prog.riftMax).toBe(10);
    expect(Object.values(prog.talents).every((v) => v === 5)).toBe(true);
    await page.click('[data-ra="close"]');
    await expect(page.locator('#riftNum')).toBeVisible();
    expect(await page.locator('#riftPips i.open, #riftPips i.on').count()).toBe(10);
    await expect(page.locator('#founderChip')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('celular con Chrome: conecta la wallet por WalletConnect sin salir de Chrome y el dueño tiene su panel', async ({ browser }) => {
  const boss = Wallet.createRandom();
  const site = await riftSite(4196, { ADMIN_WALLETS: boss.address });
  const ctx = await browser.newContext(phone);
  await withWalletApp(ctx, boss);
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.url}/`);
    await expect(page.locator('#accountBtn')).toBeVisible();
    await noAppLinks(page);
    // "Conectar wallet" de arriba: un botón por app, con el código de WalletConnect en el link.
    await page.click('#walletBtn');
    await expect(page.locator('.ra-mm h2')).toHaveText('Conectá tu wallet');
    const mm = page.locator('.ra-mm [data-app="metamask"]').first();
    await expect(mm).toHaveAttribute('href', `metamask://wc?uri=${encodeURIComponent(WC_URI)}`);
    await expect(page.locator('.ra-mm [data-app="trust"]')).toHaveAttribute('href', `trust://wc?uri=${encodeURIComponent(WC_URI)}`);
    // Elige MetaMask, aprueba la conexión en la app y vuelve.
    await mm.click();
    await page.evaluate(() => window.__wcApprove());
    // Ahora pide firmar (gratis): el botón abre la misma app.
    await expect(page.locator('.ra-mm h2')).toHaveText('Aprobá en tu wallet');
    await expect(page.locator('.ra-mm [data-app]')).toHaveAttribute('href', 'metamask://');
    await page.evaluate(() => window.__wcApprove());
    await expect(page.locator('.ra-mm')).toHaveCount(0);
    await expect(page.locator('#walletBtn')).toHaveText(new RegExp(`^${boss.address.slice(0, 6)}…${boss.address.slice(-4)}$`, 'i'));
    // La wallet quedó en la Cuenta Rift: es el dueño, con su panel.
    await page.click('#accountBtn');
    await expect(page.locator('.ra-status')).toContainText('Dueño');
    await expect(page.locator('.ra-owner')).toBeVisible();
    await page.click('[data-ra="close"]');
    // Una sola conexión para todo: el Hangar y el token usan la misma, sin conectar ni firmar de nuevo.
    expect(await page.evaluate(() => window.__RIFTFALL__.app.wallet.connected)).toBe(true);
    // Al recargar sigue conectada, sin pedir nada.
    await page.reload();
    await expect(page.locator('#accountBtn')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__RIFTFALL__?.app?.wallet?.connected ?? false), { timeout: 15_000 }).toBe(true);
    await expect(page.locator('.ra-mm')).toHaveCount(0);
    // "Conectar wallet" en cualquier lado (por ejemplo, el Hangar) no vuelve a pedir nada.
    expect(await page.evaluate(() => window.__RIFTFALL__.app.connectWallet?.() ?? true)).toBeTruthy();
    await expect(page.locator('.ra-mm')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('compu sin MetaMask: se conecta escaneando el código QR con la wallet del celular', async ({ browser }) => {
  const site = await riftSite(4197);
  const ctx = await browser.newContext(desktop);
  const w = Wallet.createRandom();
  await withWalletApp(ctx, w);
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.url}/`);
    await expect(page.locator('#accountBtn')).toBeVisible();
    await page.click('#accountBtn');
    await page.click('[data-ra="wallet"]');
    await expect(page.locator('.ra-mm [data-mm="msg"]')).toContainText('Escaneá este código');
    await expect(page.locator('.ra-mm-qr svg')).toBeVisible();
    await page.evaluate(() => window.__wcApprove());
    await expect(page.locator('.ra-mm [data-mm="msg"]')).toContainText('Abrí la wallet en tu celular');
    await page.evaluate(() => window.__wcApprove());
    await expect(page.locator('.ra-mm')).toHaveCount(0);
    await expect(page.locator('.ra-cred')).toContainText(w.address.slice(0, 6).toLowerCase());
    // El juego (Hangar, token) quedó conectado con la misma wallet.
    await expect.poll(() => page.evaluate(() => window.__RIFTFALL__.app.wallet.connected)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('celular con Chrome: cancelar, y si la conexión no anda, abrir el juego dentro de MetaMask con la misma cuenta', async ({ browser }) => {
  const site = await riftSite(4194);
  const ctx = await browser.newContext(phone);
  await withWalletApp(ctx, Wallet.createRandom());
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${site.url}/`);
    await expect(page.locator('#accountBtn')).toBeVisible();
    await noAppLinks(page);
    const token = await page.evaluate(() => localStorage.getItem('rift.session'));
    await page.click('#accountBtn');
    await page.click('[data-ra="wallet"]');
    // Toca MetaMask, vuelve a la pestaña y no llegó respuesta: la ventana dice qué probar.
    await page.locator('.ra-mm [data-app="metamask"]').first().click();
    await expect(page.locator('.ra-mm [data-mm="msg"]')).toContainText('Esperando tu wallet');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('.ra-mm [data-mm="msg"]')).toContainText('¿No te apareció nada en la wallet?', { timeout: 15_000 });
    await page.click('.ra-mm [data-mm="cancel"]');
    await expect(page.locator('.ra-mm')).toHaveCount(0);
    await expect(page.locator('.toast').last()).toContainText('Se canceló');
    // Plan B: abrir el juego dentro de MetaMask, llevando la cuenta.
    await page.click('[data-ra="wallet"]');
    await page.click('.ra-mm [data-mm="inside"]');
    const open = page.locator('.ra-mm [data-mm="open"]');
    await expect(open).toHaveText('Abrir en MetaMask');
    const href = await open.getAttribute('href');
    expect(href).toMatch(/^https:\/\/metamask\.app\.link\/dapp\/localhost:4194\/\?rf=[\w-]+&rc=[\w-]{43}$/);
    // El link no lleva la sesión (ni entera ni adentro de los datos): lleva un código de un solo uso.
    expect(href).not.toContain(token);
    const packed = new URL(href).searchParams.get('rf');
    const inside = await page.evaluate(async (text) => {
      const bytes = Uint8Array.from(atob(text.slice(1).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const raw = text[0] === 'z' ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
      return raw;
    }, packed);
    expect(inside).not.toContain(token);
    expect(inside).not.toContain('session');
    expect(inside).not.toContain('"pid"');
    const me = await page.evaluate(() => JSON.parse(localStorage.getItem('rift.account')).player.id);
    const mm = await browser.newContext(phone);
    const p2 = await mm.newPage();
    await p2.goto(`http://${href.split('/dapp/')[1]}`);
    await expect(p2.locator('#accountBtn')).toBeVisible();
    // Misma cuenta, con una sesión propia de ese navegador; la dirección queda limpia.
    const got = await p2.evaluate(() => ({ token: localStorage.getItem('rift.session'), id: JSON.parse(localStorage.getItem('rift.account')).player.id, search: location.search }));
    expect(got.id).toBe(me);
    expect(got.token).toBeTruthy();
    expect(got.token).not.toBe(token);
    expect(got.search).toBe('');
    await mm.close();
    // El mismo link, abierto otra vez por otra persona: el código ya se usó y no entra a la cuenta.
    const thief = await browser.newContext(phone);
    const p3 = await thief.newPage();
    await p3.goto(`http://${href.split('/dapp/')[1]}`);
    await expect(p3.locator('#accountBtn')).toBeVisible();
    await expect.poll(() => p3.evaluate(() => JSON.parse(localStorage.getItem('rift.account') ?? 'null')?.player?.id ?? null)).not.toBeNull();
    expect(await p3.evaluate(() => JSON.parse(localStorage.getItem('rift.account')).player.id)).not.toBe(me);
    await thief.close();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    site.close();
  }
});

test('mudanza: quien abre otra dirección (Vercel o Cloudflare) pasa al link de siempre (duckdns) con su progreso', async ({ browser }) => {
  test.setTimeout(240_000);
  const DIST = path.resolve('dist-e2e');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  const api = createApi({ chain: { payment: async () => ({ kind: null, reason: 'notFound' }) } });
  const env = { DB: createD1() };
  const ctx = await browser.newContext(phone);
  // Las tres direcciones se sirven desde el build de prueba (sin red); duckdns es la de siempre.
  await ctx.route(/^https?:\/\/(riftfall-chi\.vercel\.app|riftgames\.pages\.dev|riftfall\.duckdns\.org)\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) {
      if (url.hostname === 'riftfall-chi.vercel.app') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      const r = await api.handle(new Request(url, { method: req.method(), headers: req.headers(), body: req.postDataBuffer() ?? undefined }), env);
      return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    }
    let file = path.join(DIST, url.pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
  });
  try {
    const page = await ctx.newPage();
    const progress = { cores: 321, lifetimeCores: 900, talents: { hull: 2 }, riftMax: 1, parts: {}, loadout: {}, runs: 9, bestScore: 7777, bestTime: 300, kills: 800, bosses: 2, victories: 0, streak: 2, lastDay: '', updatedAt: Date.now() };
    await ctx.addInitScript((p) => {
      if (location.hostname.endsWith('vercel.app') && !localStorage.getItem('riftfall.progress')) {
        localStorage.setItem('riftfall.progress', JSON.stringify(p));
        localStorage.setItem('riftfall.name', 'Papá');
      }
    }, progress);
    await page.goto('https://riftfall-chi.vercel.app/');
    await page.waitForURL(/^https:\/\/riftfall\.duckdns\.org\//, { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => window.__RIFTFALL__?.app.progress.bestScore ?? 0).catch(() => 0), { timeout: 60_000 }).toBe(7777);
    expect(page.url()).not.toContain('mv=');
    // Y el progreso queda en la cuenta (nube) del sitio nuevo.
    await expect.poll(async () => (await env.DB.prepare("SELECT data FROM saves WHERE game = 'riftfall'").first())?.data ?? '', { timeout: 30_000 }).toContain('"bestScore":7777');

    // Con cuenta en la dirección vieja (Cloudflare): llega a la de siempre adentro de la misma cuenta,
    // con un código de un solo uso. La sesión no pasa por ningún link.
    const made = await api.handle(new Request('https://riftgames.pages.dev/api/rift/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vieja' }) }), env);
    const old = await made.json();
    await ctx.addInitScript((token) => {
      if (location.hostname === 'riftgames.pages.dev') localStorage.setItem('rift.session', token);
    }, old.token);
    const seen = [];
    page.on('framenavigated', (f) => f === page.mainFrame() && seen.push(f.url()));
    await page.goto('https://riftgames.pages.dev/');
    await page.waitForURL(/^https:\/\/riftfall\.duckdns\.org\//, { timeout: 60_000 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rift.account') ?? 'null')?.player?.id ?? null).catch(() => null), { timeout: 60_000 }).toBe(old.account.player.id);
    const arrived = seen.find((u) => u.startsWith('https://riftfall.duckdns.org/') && u.includes('mc='));
    expect(arrived, 'la mudanza llevó un código').toBeTruthy();
    expect(seen.join(' ')).not.toContain(old.token);
    expect(page.url()).not.toContain('mc=');
    expect(await page.evaluate(() => localStorage.getItem('rift.session'))).not.toBe(old.token);
    // Ese código ya no sirve.
    const code = new URL(arrived).searchParams.get('mc');
    const again = await api.handle(new Request('https://riftfall.duckdns.org/api/rift/handoff/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, purpose: 'move', origin: 'https://riftfall.duckdns.org' }) }), env);
    expect(again.status).toBe(400);
  } finally {
    await ctx.close();
  }
});
