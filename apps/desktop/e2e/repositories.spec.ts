import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock backend's folder picker always selects C:\repos\demo.
const openStartAction = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${label}`) }).click();

test.describe('repositories', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Git Panther' })).toBeVisible();
  });

  test('opens a repository in a tab and remembers it as recent', async ({ page }) => {
    await openStartAction(page, 'Open repository');

    await expect(page.getByRole('tab', { name: 'demo' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'demo' })).toBeVisible();
    await expect(page.getByText('On branch main')).toBeVisible();

    await page.getByRole('button', { name: 'Close demo' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Git Panther' })).toBeVisible();

    const recent = page.getByRole('region', { name: 'Recent' });
    await recent.getByRole('button', { name: /^demo/ }).click();
    await expect(page.getByRole('tab', { name: 'demo' })).toBeVisible();
  });

  test('initializes a new repository', async ({ page }) => {
    await openStartAction(page, 'Init');
    await expect(page.getByText('On branch main, no commits yet')).toBeVisible();
  });

  test('clones with progress and opens the result', async ({ page }) => {
    await openStartAction(page, 'Clone');
    const dialog = page.getByRole('dialog', { name: 'Clone a repository' });

    await dialog.getByLabel('Repository URL').fill('https://github.com/acme/app.git');
    await dialog.getByRole('button', { name: 'Browse…' }).click();
    await expect(dialog.getByLabel('Folder name')).toHaveValue('app');
    await dialog.getByRole('button', { name: 'Clone', exact: true }).click();

    await expect(dialog.getByRole('progressbar', { name: 'Clone progress' })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('tab', { name: 'app' })).toHaveAttribute('aria-selected', 'true');
  });

  test('cancels a running clone', async ({ page }) => {
    await openStartAction(page, 'Clone');
    const dialog = page.getByRole('dialog', { name: 'Clone a repository' });
    await dialog.getByLabel('Repository URL').fill('https://github.com/acme/app.git');
    await dialog.getByRole('button', { name: 'Browse…' }).click();
    await dialog.getByRole('button', { name: 'Clone', exact: true }).click();

    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('Clone cancelled.');
    await expect(page.getByRole('tab', { name: 'app' })).toHaveCount(0);
  });
});
