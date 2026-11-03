import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock backend's develop branch is 1 ahead and 2 behind origin/develop;
// main is level with origin/main.
const toolbar = (page: Page) => page.getByRole('group', { name: 'Sync with remotes' });
const branchRow = (page: Page, label: string) =>
  page
    .getByRole('tree', { name: 'Local branches' })
    .getByRole('button', { name: new RegExp(`^${label}`) });

async function openRepository(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(toolbar(page)).toBeVisible();
}

test.describe('sync', () => {
  test('fetches with progress', async ({ page }) => {
    await openRepository(page);
    await toolbar(page).getByRole('button', { name: 'Fetch' }).click();
    await expect(page.getByRole('status')).toContainText('Fetching');
    await expect(page.getByRole('status')).toHaveText('Fetched');
  });

  test('a diverged pull needs merge or rebase', async ({ page }) => {
    await openRepository(page);
    await branchRow(page, 'develop').dblclick();
    await expect(branchRow(page, 'checked out develop')).toBeVisible();
    await expect(toolbar(page).getByLabel('2 to pull')).toBeVisible();

    await toolbar(page).getByRole('button', { name: /^Pull/ }).click();
    await expect(page.getByRole('alert')).toContainText('cannot be fast-forwarded');

    await toolbar(page).getByRole('button', { name: 'Choose how to pull' }).click();
    await page.getByRole('menuitemradio', { name: 'Rebase' }).click();
    await toolbar(page).getByRole('button', { name: /^Pull/ }).click();
    await expect(page.getByRole('status')).toHaveText('Pulled');
    await expect(toolbar(page).getByLabel('2 to pull')).toBeHidden();

    await toolbar(page).getByRole('button', { name: /^Push/ }).click();
    await expect(page.getByRole('status')).toHaveText('Pushed');
    await expect(toolbar(page).getByLabel('1 to push')).toBeHidden();
  });

  test('remembers the pull strategy', async ({ page }) => {
    await openRepository(page);
    await toolbar(page).getByRole('button', { name: 'Choose how to pull' }).click();
    await page.getByRole('menuitemradio', { name: 'Merge' }).click();

    await page.reload();
    await toolbar(page).getByRole('button', { name: 'Choose how to pull' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Merge' })).toBeChecked();
  });

  test('can be cancelled', async ({ page }) => {
    await openRepository(page);
    await toolbar(page).getByRole('button', { name: 'Fetch' }).click();
    await page.getByRole('status').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('status')).toBeHidden();
    await expect(page.getByRole('alert')).toBeHidden();
  });

  test('explains an unreachable remote', async ({ page }) => {
    await openRepository(page, '?mockSync=offline');
    await toolbar(page).getByRole('button', { name: /^Push/ }).click();
    await expect(page.getByRole('alert')).toContainText('Could not reach the remote');
    await page.getByRole('alert').getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('alert')).toBeHidden();
  });
});
