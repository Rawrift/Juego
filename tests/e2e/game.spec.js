import { test, expect } from '@playwright/test';

test('RIGYARD boots, simulates physics and exposes playable systems', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto('/');
  await page.waitForTimeout(3500);
  await page.waitForFunction(() => window.__RIGYARD_VISUAL__?.environmentAssetsSettled === true, null, { timeout: 20_000 });

  const diagnostic = await page.evaluate(() => ({
    ready: window.__RIGYARD_TEST__?.ready === true,
    bootStatus: document.querySelector('#bootStatus')?.textContent || '',
    bootError: document.querySelector('#bootError')?.textContent || '',
    bootErrorDisplay: getComputedStyle(document.querySelector('#bootError')).display,
    canvasWidth: document.querySelector('#game')?.width || 0,
    canvasHeight: document.querySelector('#game')?.height || 0,
    webgl: !!(document.querySelector('#game')?.getContext('webgl2') || document.querySelector('#game')?.getContext('webgl')),
    href: location.href
  }));
  console.log('RIGYARD_DIAGNOSTIC=' + JSON.stringify({ diagnostic, errors }));

  expect(diagnostic.ready, JSON.stringify({ diagnostic, errors }, null, 2)).toBe(true);
  expect(diagnostic.bootError, diagnostic.bootError).toBe('');

  const initial = await page.evaluate(() => window.__RIGYARD_TEST__.snapshot());
  expect(initial.physics).toBe(true);
  expect(initial.npcs).toBeGreaterThanOrEqual(4);
  expect(initial.props).toBeGreaterThanOrEqual(5);
  expect(initial.npcs).toBeGreaterThanOrEqual(6);
  expect(initial.visual?.version).toBe('cinematic-industrial-v1');
  expect(initial.visual?.decorCount).toBeGreaterThan(80);
  expect(initial.visual?.assetVisualCount).toBeGreaterThan(20);

  await page.click('#enter');
  await page.evaluate(() => window.__RIGYARD_TEST__.setPlaying(true));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');

  const moved = await page.evaluate(() => window.__RIGYARD_TEST__.snapshot());
  expect(Math.abs(moved.player.z - initial.player.z) + Math.abs(moved.player.x - initial.player.x)).toBeGreaterThan(0.15);

  const beforeProps = moved.props;
  await page.evaluate(() => window.__RIGYARD_TEST__.spawn('crate'));
  await page.waitForTimeout(700);
  const afterSpawn = await page.evaluate(() => window.__RIGYARD_TEST__.snapshot());
  expect(afterSpawn.props).toBe(beforeProps + 1);

  await page.evaluate(() => window.__RIGYARD_TEST__.setThirdPerson(true));
  const third = await page.evaluate(() => window.__RIGYARD_TEST__.snapshot());
  expect(third.thirdPerson).toBe(true);

  await page.evaluate(() => {
    window.__RIGYARD_TEST__.setThirdPerson(false);
    window.__RIGYARD_TEST__.setPose({ x: 0, y: 1.15, z: 17, yaw: 0, pitch: -6 });
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/rigyard-spawn.png', fullPage: true });

  await page.evaluate(() => window.__RIGYARD_TEST__.setPose({ x: 10, y: 1.15, z: 15, yaw: -90, pitch: -5 }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/rigyard-hangar.png', fullPage: true });

  await page.evaluate(() => window.__RIGYARD_TEST__.setPose({ x: 14, y: 1.15, z: -16, yaw: -55, pitch: -6 }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/rigyard-tower.png', fullPage: true });

  expect(errors, errors.join('\n')).toEqual([]);
});
