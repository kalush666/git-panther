import { expect, test } from './fixtures';

test('redoes what was undone, from the header and with Ctrl+Y', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  const header = page.locator('header').filter({ has: page.getByRole('button', { name: 'Redo' }) });
  const redo = header.getByRole('button', { name: 'Redo', exact: true });
  await expect(redo).toBeDisabled();

  await page
    .getByRole('tree', { name: 'Local branches' })
    .getByRole('button', { name: /^develop/ })
    .dblclick();
  await expect(page.getByRole('status').filter({ hasText: 'Switched to develop' })).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect(
    page.getByRole('status').filter({ hasText: 'Undid: Check out develop' }),
  ).toBeVisible();
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Redid: Check out develop' }),
  ).toBeVisible();
  await expect(redo).toBeDisabled();

  await page.keyboard.press('Control+z');
  await expect(page.getByRole('status').filter({ hasText: 'Undid:' })).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(page.getByRole('status').filter({ hasText: 'Redid:' })).toBeVisible();
});
