import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// In the mock history "Change number 4997" is the commit that broke things:
// it and everything newer is bad, everything older good.
const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });

test.describe('bisect', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('finds the first bad commit from Good and Bad clicks', async ({ page }) => {
    await commitRow(page, 'Change number 4991').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Bisect: find what broke since this commit' }).click();

    const bar = page.getByRole('group', { name: 'Bisect' });
    await expect(bar).toContainText(/Bisect: test \w{7} Change number 4996/);
    await expect(bar).toContainText(/steps? left/);
    await bar.getByRole('button', { name: 'Good' }).click();
    await expect(bar).toContainText('Change number 4998');
    await bar.getByRole('button', { name: 'Bad' }).click();
    await expect(bar).toContainText('Change number 4997');
    await bar.getByRole('button', { name: 'Bad' }).click();

    const found = page.getByRole('status', { name: 'Bisect' });
    await expect(found).toContainText(/First bad commit: \w{7} Change number 4997/);
    await found.getByRole('button', { name: 'Done' }).click();
    await expect(found).toBeHidden();
  });

  test('stops a bisect midway', async ({ page }) => {
    await commitRow(page, 'Change number 4991').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Bisect: find what broke since this commit' }).click();
    const bar = page.getByRole('group', { name: 'Bisect' });
    await bar.getByRole('button', { name: 'Stop' }).click();
    await expect(bar).toBeHidden();
  });
});
