import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock starts on main; feature/login goes into develop. With
// `?mockConflictWarning=1` it would conflict in two files.
async function onFeatureBranch(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await page
    .getByRole('tree', { name: 'Local branches' })
    .getByRole('button', { name: /^login/ })
    .dblclick();
  await expect(
    page.getByRole('status').filter({ hasText: 'Switched to feature/login' }),
  ).toBeVisible();
}

test.describe('conflict warning', () => {
  test('says when the branch merges cleanly into its target', async ({ page }) => {
    await onFeatureBranch(page);
    await expect(page.getByText('Merges cleanly into develop')).toBeVisible();
  });

  test('warns early about conflicts and offers to rebase now', async ({ page }) => {
    await onFeatureBranch(page, '?mockConflictWarning=1');
    await page.getByRole('button', { name: 'Would conflict with develop (2 files)' }).click();
    await expect(page.getByRole('list', { name: 'Files that would conflict' })).toContainText(
      'src/login.ts',
    );
    await page.getByRole('menuitem', { name: 'Rebase feature/login onto develop now' }).click();
    await expect(page.getByText('Rebased onto develop')).toBeVisible();
  });

  test('main itself gets no warning', async ({ page }) => {
    await page.goto('/?mockConflictWarning=1');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(page.getByRole('listbox', { name: 'Commits' })).toBeVisible();
    await expect(page.getByText(/Would conflict|Merges cleanly/)).toHaveCount(0);
  });
});
