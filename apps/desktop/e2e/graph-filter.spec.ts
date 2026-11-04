import { expect, test } from './fixtures';

// Mock commits rotate through four authors: Ada Byron, Grace Hopper, Linus T.
// and Margaret H., newest first, all well over a year old.
test.describe('graph filter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page
      .getByRole('group', { name: 'Filter commits' })
      .getByRole('button', { name: 'Filter' })
      .click();
  });

  test('dims commits by other authors and clears with one click', async ({ page }) => {
    const rows = page.getByRole('listbox', { name: 'Commits' }).getByRole('option');
    await page.getByLabel('Author').fill('grace');

    await expect(rows.nth(0)).toHaveAttribute('data-dimmed', 'true');
    await expect(rows.nth(1)).toHaveAttribute('data-dimmed', 'false');
    await expect(
      page.getByRole('group', { name: 'Filter commits' }).getByRole('status'),
    ).toHaveText(/^\d+ shown$/);

    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(rows.nth(0)).toHaveAttribute('data-dimmed', 'false');
  });

  test('dims commits older than the chosen range', async ({ page }) => {
    const rows = page.getByRole('listbox', { name: 'Commits' }).getByRole('option');
    await page.getByLabel('Since').selectOption({ label: 'Last 30 days' });
    await expect(rows.nth(0)).toHaveAttribute('data-dimmed', 'true');
    await expect(
      page.getByRole('group', { name: 'Filter commits' }).getByRole('status'),
    ).toHaveText('0 shown');
  });
});
