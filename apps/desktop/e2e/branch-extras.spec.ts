import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });
const localRow = (page: Page, label: string) =>
  sidebar(page)
    .getByRole('tree', { name: 'Local branches' })
    .getByRole('button', { name: new RegExp(`^${label}`) });
const remoteRow = (page: Page, label: string) =>
  sidebar(page)
    .getByRole('tree', { name: 'Remote branches' })
    .getByRole('button', { name: new RegExp(`^${label}`) });

test.describe('branch extras', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test('a drop can fast-forward without checking out', async ({ page }) => {
    await localRow(page, 'login').dragTo(localRow(page, 'develop'));
    await page.getByRole('menuitem', { name: 'Fast-forward develop to feature/login' }).click();
    await expect(page.getByText('Fast-forwarded develop to feature/login')).toBeVisible();
    await expect(localRow(page, 'checked out main')).toBeVisible();
  });

  test('a local branch dropped on a remote one pushes there', async ({ page }) => {
    await localRow(page, 'login').dragTo(remoteRow(page, 'develop'));
    await page.getByRole('menuitem', { name: 'Push feature/login to origin/develop' }).click();
    await expect(page.getByText('Pushed feature/login to origin/develop')).toBeVisible();
  });

  test('pins a branch to the top and unpins it', async ({ page }) => {
    await localRow(page, 'develop').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Pin to the top' }).click();
    const pinned = sidebar(page).getByRole('tree', { name: 'Pinned branches' });
    await expect(pinned.getByRole('button', { name: /^develop/ })).toBeVisible();

    await pinned.getByRole('button', { name: /^develop/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Unpin from the top' }).click();
    await expect(pinned).toHaveCount(0);
  });

  test('sets the upstream a branch tracks', async ({ page }) => {
    await localRow(page, 'login').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Set upstream…' }).click();
    const bar = page.getByRole('form', { name: 'Track a remote branch with feature/login' });
    await expect(bar.getByLabel('Upstream')).toHaveValue('origin/feature/login');
    await bar.getByLabel('Upstream').press('Enter');
    await expect(page.getByText('feature/login now tracks origin/feature/login')).toBeVisible();
  });

  test('rebases the current branch onto a commit', async ({ page }) => {
    await page
      .getByRole('listbox', { name: 'Commits' })
      .getByRole('option', { name: /Change number 4991/ })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rebase main onto this commit' }).click();
    await expect(page.getByText(/^Rebased onto commit \w{7}$/)).toBeVisible();
  });
});
