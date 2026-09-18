import { test, expect } from '@playwright/test';

test('RIGYARD boots, simulates physics and exposes playable systems', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.waitForFunction(() => window.__RIGYARD_TEST__?.ready === true, null, { timeout: 45_000 });

  const initial = await page.evaluate(() => window.__RIGYARD_TEST__.snapshot());
  expect(initial.physics).toBe(true);
  expect(initial.npcs).toBeGreaterThanOrEqual(4);
  expect(initial.props).toBeGreaterThanOrEqual(5);

  await page.click('#enter');
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

  expect(errors, errors.join('\n')).toEqual([]);
});
