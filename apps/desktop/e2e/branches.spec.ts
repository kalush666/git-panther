import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock backend starts with local main (checked out), develop,
// feature/graph (unmerged) and feature/login, plus origin/develop,
// origin/main and origin/release/1.0.
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });
const localTree = (page: Page) => sidebar(page).getByRole('tree', { name: 'Local branches' });
const branchRow = (page: Page, label: string) =>
  localTree(page).getByRole('button', { name: new RegExp(`^${label}`) });

test.describe('branches', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test('lists branches in folders with the checked-out one marked', async ({ page }) => {
    await expect(localTree(page).getByRole('button', { name: 'feature' })).toBeVisible();
    await expect(branchRow(page, 'checked out main')).toBeVisible();
    await expect(branchRow(page, 'develop')).toContainText('↑1');
  });

  test('switches branches by double-clicking', async ({ page }) => {
    await branchRow(page, 'develop').dblclick();
    await expect(branchRow(page, 'checked out develop')).toBeVisible();
  });

  test('checking out a remote branch creates a local one', async ({ page }) => {
    const remote = sidebar(page).getByRole('tree', { name: 'Remote branches' });
    await remote.getByRole('button', { name: /^1\.0/ }).dblclick();
    await expect(localTree(page).getByRole('button', { name: 'release' })).toBeVisible();
  });

  test('creates a branch from a commit', async ({ page }) => {
    const commits = page.getByRole('listbox', { name: 'Commits' });
    await commits.getByRole('option', { name: /Merge topic 5/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create branch here…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Create branch' });
    await dialog.getByLabel('Branch name').fill('bad name');
    await dialog.getByRole('button', { name: 'Create branch' }).click();
    await expect(dialog.getByRole('alert')).toContainText('not a valid branch name');

    await dialog.getByLabel('Branch name').fill('hotfix/login');
    await dialog.getByRole('button', { name: 'Create branch' }).click();

    await expect(dialog).toBeHidden();
    await expect(localTree(page).getByRole('button', { name: 'hotfix' })).toBeVisible();
    // The new branch was switched to, so it is the checked-out one.
    await expect(branchRow(page, 'checked out login')).toBeVisible();
  });

  test('renames a branch', async ({ page }) => {
    await branchRow(page, 'develop').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename branch' });
    await dialog.getByLabel('Branch name').fill('development');
    await dialog.getByRole('button', { name: 'Rename' }).click();

    await expect(branchRow(page, 'development')).toBeVisible();
  });

  test('asks again before deleting an unmerged branch', async ({ page }) => {
    await branchRow(page, 'graph').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    await page
      .getByRole('dialog', { name: 'Delete branch?' })
      .getByRole('button', { name: 'Delete' })
      .click();

    const confirm = page.getByRole('dialog', { name: 'Delete unmerged branch?' });
    await confirm.getByRole('button', { name: 'Delete anyway' }).click();

    await expect(confirm).toBeHidden();
    await expect(branchRow(page, 'graph')).toHaveCount(0);
  });
});
