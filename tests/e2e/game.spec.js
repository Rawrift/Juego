import { test, expect } from '@playwright/test';

test('RIGYARD boots, simulates physics and exposes playable systems', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 960, height: 600 });
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
  console.log('RIGYARD_VISUAL_STATE=' + JSON.stringify(initial.visual));
  console.log('RIGYARD_POST_STATE=' + JSON.stringify(initial.post));
  expect(initial.physics).toBe(true);
  expect(initial.npcs).toBeGreaterThanOrEqual(4);
  expect(initial.props).toBeGreaterThanOrEqual(5);
  expect(initial.npcs).toBeGreaterThanOrEqual(6);
  expect(initial.visual?.version).toBe('cinematic-industrial-v3');
  expect(initial.visual?.pbrTexturesSettled).toBe(true);
  expect(initial.visual?.decorCount).toBeGreaterThan(80);
  expect(initial.visual?.assetVisualCount).toBeGreaterThan(20);
  expect(initial.visual?.pbrMapCount).toBeGreaterThanOrEqual(26);
  expect(initial.visual?.decals).toBeGreaterThanOrEqual(7);
  expect(initial.post?.cameraFrame).toBe(true);
  expect(initial.post?.ssao).toBe('lighting');
  expect(initial.post?.bloom).toBeGreaterThan(0);

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
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/rigyard-spawn.png' });

  await page.evaluate(() => window.__RIGYARD_TEST__.setPose({ x: 27, y: 1.15, z: 15, yaw: -90, pitch: -4 }));
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/rigyard-hangar.png' });

  await page.evaluate(() => window.__RIGYARD_TEST__.setPose({ x: 34, y: 1.15, z: -20, yaw: -42, pitch: -5 }));
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/rigyard-tower.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});
