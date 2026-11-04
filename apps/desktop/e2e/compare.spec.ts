import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });

test.describe('compare', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('compares a branch with the current one from its menu', async ({ page }) => {
    await sidebar(page)
      .getByRole('tree', { name: 'Local branches' })
      .getByRole('button', { name: /^develop/ })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Compare develop with main' }).click();

    const review = page.getByRole('region', { name: 'Review of develop compared with main' });
    await expect(review.getByRole('tab', { name: 'Files (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(review.getByRole('tab', { name: 'Overview' })).toHaveCount(0);
    await expect(review.getByRole('list', { name: 'Changed files' })).toContainText('src/login.ts');

    await page.keyboard.press('Escape');
    await expect(review).toBeHidden();
    await expect(page.getByRole('listbox', { name: 'Commits' })).toBeVisible();
  });

  test('compares any two revisions from the command palette', async ({ page }) => {
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox').fill('Compare branches');
    await page.keyboard.press('Enter');

    const bar = page.getByRole('form', { name: 'Compare' });
    await expect(bar.getByLabel('Base')).toHaveValue('origin/main');
    await expect(bar.getByLabel('Compare', { exact: true })).toHaveValue('main');
    await bar.getByLabel('Compare', { exact: true }).fill('no-such-branch');
    await bar.getByLabel('Compare', { exact: true }).press('Enter');

    await expect(
      page.getByRole('region', { name: 'Review of no-such-branch compared with origin/main' }),
    ).toContainText('Commit no-such-branch does not exist.');
  });
});
