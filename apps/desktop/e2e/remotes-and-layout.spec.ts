import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock repository has one remote, origin, with develop, main and
// release/1.0; two submodules (one not cloned); and only the main worktree.
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });
const remoteTree = (page: Page) => sidebar(page).getByRole('tree', { name: 'Remote branches' });

async function openRepository(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(sidebar(page)).toBeVisible();
}

test.describe('remotes and repository layout', () => {
  test('adds a remote and pushes to it from the push menu', async ({ page }) => {
    await openRepository(page);
    await sidebar(page).getByRole('button', { name: 'Add remote' }).click();
    const bar = page.getByRole('form', { name: 'Add remote' });
    await expect(bar.getByLabel('Remote name')).toHaveValue('upstream');
    await bar.getByLabel('Remote URL').fill('git@git.example.internal:upstream/demo.git');
    await bar.getByLabel('Remote URL').press('Enter');
    await expect(page.getByText('Added remote upstream')).toBeVisible();

    await page.getByRole('button', { name: 'More ways to push' }).click();
    await page.getByRole('menuitem', { name: 'Push to upstream' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pushed' })).toBeVisible();
  });

  test('force pushes with lease in one click', async ({ page }) => {
    await openRepository(page);
    await page.getByRole('button', { name: 'More ways to push' }).click();
    await page.getByRole('menuitem', { name: 'Force push (safe, with lease)' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pushed' })).toBeVisible();
  });

  test('deletes a remote branch after asking in the bar', async ({ page }) => {
    await openRepository(page);
    await remoteTree(page).getByRole('button', { name: /^1\.0/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete on remote…' }).click();
    await page
      .getByRole('form', { name: /Delete origin\/release\/1\.0 on the server/ })
      .getByRole('button', { name: 'Delete on remote' })
      .click();
    await expect(remoteTree(page).getByRole('button', { name: /^1\.0/ })).toHaveCount(0);
  });

  test('edits and removes a remote from its folder', async ({ page }) => {
    await openRepository(page);
    await remoteTree(page).getByRole('button', { name: 'origin' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Edit URL…' }).click();
    const bar = page.getByRole('form', { name: 'URL of origin' });
    await expect(bar.getByLabel('Remote URL')).toHaveValue(
      'git@git.example.internal:team/demo.git',
    );
    await bar.getByLabel('Remote URL').fill('git@git.example.internal:team/renamed.git');
    await bar.getByLabel('Remote URL').press('Enter');
    await expect(page.getByText('Updated origin')).toBeVisible();
  });

  test('opens a branch in a new worktree tab and lists it', async ({ page }) => {
    await openRepository(page);
    await sidebar(page)
      .getByRole('tree', { name: 'Local branches' })
      .getByRole('button', { name: /^develop/ })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in a new worktree' }).click();
    await expect(page.getByRole('tab', { name: /demo-develop/ })).toBeVisible();
  });

  test('updates submodules in one click', async ({ page }) => {
    await openRepository(page);
    const submodules = sidebar(page).getByRole('list', { name: 'Submodules' });
    await expect(submodules).toContainText('not cloned');
    await sidebar(page).getByRole('button', { name: 'Update submodules' }).click();
    await expect(submodules).not.toContainText('not cloned');
  });

  test('warns when the repository needs Git LFS', async ({ page }) => {
    await openRepository(page, '?mockLfs=missing');
    await expect(page.getByText(/stores large files with Git LFS/)).toBeVisible();
  });
});
