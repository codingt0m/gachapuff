import { expect, test, type Page } from '@playwright/test';

/** Seeded draws + unlimited boosters: the run is deterministic. */
const START = '/?dev=1&seed=42#/';

async function openWithSkip(page: Page) {
  await page
    .getByRole('button', { name: /^Ouvrir/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Déchirer le booster' }).click();
  // Escape (or a tap anywhere) skips the animation.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Terminé' }).click();
}

async function ownedCount(page: Page): Promise<number> {
  await page.getByRole('link', { name: 'Réglages' }).click();
  const value = page.getByText('Puffs possédées').locator('xpath=following-sibling::dd');
  return Number(await value.textContent());
}

test('open a booster, find it in the album, recycle three puffs', async ({ page }) => {
  await page.goto(START);

  // 1. Open a booster the full way: tap the pack to tear it, wait for the reveal.
  await page
    .getByRole('button', { name: /^Ouvrir/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Déchirer le booster' }).click();
  const dialog = page.getByRole('dialog');
  const add = dialog.getByRole('button', { name: 'Terminé' });
  await expect(add).toBeVisible();
  const flavor = (await dialog.getByRole('heading', { level: 2 }).textContent())?.trim() ?? '';
  expect(flavor).not.toBe('');
  await add.click();
  await expect(dialog).toBeHidden();

  // 2. It is in the album.
  await page.getByRole('link', { name: 'Album' }).click();
  await page.getByRole('radio', { name: 'Obtenues' }).check();
  await expect(page.getByRole('link', { name: `${flavor}, ` }).first()).toBeVisible();

  // 3. Open more boosters until a fusion is possible, then recycle.
  await page.getByRole('link', { name: /Booster/ }).click();
  for (let i = 0; i < 11; i++) await openWithSkip(page);
  const before = await ownedCount(page);
  expect(before).toBe(12);

  await page.getByRole('link', { name: 'Recyclage' }).click();
  // The machine is pre-filled (duplicates first): one tap to fuse.
  await page.getByRole('button', { name: 'Fusionner', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Fusionner quand même' });
  if (await confirm.isVisible()) await confirm.click();
  await page.getByRole('button', { name: 'Trop bien !' }).click();

  expect(await ownedCount(page)).toBe(before - 2);

  // 4. The save survives a reload (IndexedDB).
  await page.reload();
  expect(await ownedCount(page)).toBe(before - 2);
});
