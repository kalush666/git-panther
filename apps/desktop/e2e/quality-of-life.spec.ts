import { expect, test } from './fixtures';

// The mock working copy starts with three unstaged changes.
test.describe('quality of life', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('commits every change with Ctrl+Enter when nothing is staged', async ({ page }) => {
    const form = page
      .getByRole('complementary', { name: 'Working copy' })
      .getByRole('form', { name: 'Commit' });
    await expect(form.getByRole('button', { name: 'Stage all and commit 3 files' })).toBeDisabled();

    await form.getByLabel('Commit summary').fill('Everything at once');
    await form.getByLabel('Commit summary').press('Control+Enter');
    await expect(page.getByRole('button', { name: /Working copy/ })).toBeHidden();
  });

  test('success messages clear themselves', async ({ page }) => {
    await page.getByRole('button', { name: 'Fetch' }).click();
    const done = page.getByRole('status').filter({ hasText: 'Fetched' });
    await expect(done).toBeVisible();
    await expect(done).toBeHidden({ timeout: 8_000 });
  });

  test('auto-fetch can be set in settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const choice = page.getByRole('radiogroup', { name: 'Fetch automatically' });
    await expect(choice.getByLabel('Every 10 min')).toBeChecked();
    await choice.getByLabel('Off').check();
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(
      page.getByRole('radiogroup', { name: 'Fetch automatically' }).getByLabel('Off'),
    ).toBeChecked();
  });
});
