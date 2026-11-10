import { expect, test } from './fixtures';

test('restores a file as it was in a commit, from the commit details', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await page
    .getByRole('listbox', { name: 'Commits' })
    .getByRole('option', { name: /Change number 4998/ })
    .click();
  const details = page.locator('aside').filter({ hasText: 'Change number 4998' });
  await details.getByRole('button', { name: /src\/file\d\.ts/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Restore this version (staged)' }).click();
  await expect(page.getByText(/^Restored src\/file\d\.ts from \w{7}, staged$/)).toBeVisible();
});
