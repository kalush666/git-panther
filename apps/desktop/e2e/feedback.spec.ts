import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock starts on main with three uncommitted files. Its develop branch is
// 1 ahead and 2 behind origin/develop. `?mockCheckout=conflict` makes those
// uncommitted files block switching branches until they are stashed.
const localTree = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('tree', { name: 'Local branches' });
const branchRow = (page: Page, label: string) =>
  localTree(page).getByRole('button', { name: new RegExp(`^${label}`) });
const banner = (page: Page) => page.locator('[data-tone]').filter({ has: page.locator('svg') });

async function open(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(localTree(page)).toBeVisible();
}

test.describe('feedback on actions', () => {
  test('says when a branch switch is done', async ({ page }) => {
    await open(page);
    await branchRow(page, 'develop').dblclick();
    await expect(page.getByRole('status').filter({ hasText: 'Switched to develop' })).toBeVisible();
  });

  test('offers to stash changes that block a switch, then switches', async ({ page }) => {
    await open(page, '?mockCheckout=conflict');
    await branchRow(page, 'develop').dblclick();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Your uncommitted changes would be overwritten.');
    // git's own words wait under Details.
    await expect(alert).not.toContainText('src/app.ts');
    await alert.getByRole('button', { name: 'Details' }).click();
    await expect(alert).toContainText('src/app.ts');

    await alert.getByRole('button', { name: 'Stash changes and switch' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Stashed your changes and switched to develop' }),
    ).toBeVisible();
    await expect(branchRow(page, 'checked out develop')).toBeVisible();
  });

  test('a push rejected after rewriting history offers a force push', async ({ page }) => {
    await open(page);
    await branchRow(page, 'develop').dblclick();
    await page.getByRole('button', { name: /^Push/ }).click();
    const error = page.getByRole('alert');
    await expect(error).toContainText('Pull first');

    await error.getByRole('button', { name: 'Force push' }).click();
    await error.getByRole('button', { name: 'Overwrite the remote branch?' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pushed' })).toBeVisible();
  });

  test('changed files sit in a bordered list, one row each', async ({ page }) => {
    await open(page);
    const list = page
      .getByRole('complementary', { name: 'Working copy' })
      .getByRole('list')
      .first();
    await expect(list).toHaveCSS('border-top-style', 'solid');
    await expect(list.getByRole('listitem').nth(1)).toHaveCSS('border-top-style', 'solid');
    await expect(banner(page)).toHaveCount(0);
  });
});
