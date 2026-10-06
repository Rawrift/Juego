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

async function riftSite(port) {
  const DIST = path.resolve('dist-e2e');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
  const api = createApi({ chain: { payment: async () => ({ kind: null, reason: 'notFound' }) } });
  const env = { DB: createD1() };
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
  const withWallet = async (ctx) => {
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
  };
  const a = await browser.newContext(phone);
  const b = await browser.newContext(desktop);
  await withWallet(a);
  await withWallet(b);
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
