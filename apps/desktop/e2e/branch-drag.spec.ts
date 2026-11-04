import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock starts on main, with local develop, feature/graph and
// feature/login, and origin/develop.
const localTree = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('tree', { name: 'Local branches' });
const branchRow = (page: Page, label: string) =>
  localTree(page).getByRole('button', { name: new RegExp(`^${label}`) });
const graphLabel = (page: Page, name: string) =>
  page
    .getByRole('listbox', { name: 'Commits' })
    .locator('[draggable="true"]')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .first();

test.describe('dragging branches', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(localTree(page)).toBeVisible();
  });

  test('a branch dropped on one that is not checked out merges into it', async ({ page }) => {
    await branchRow(page, 'login').dragTo(branchRow(page, 'develop'));
    await expect(
      page.getByRole('menuitem', { name: 'Rebase feature/login onto develop', exact: true }),
    ).toBeVisible();
    await page.getByRole('menuitem', { name: 'Merge feature/login into develop' }).click();

    await expect(page.getByText('Merged feature/login')).toBeVisible();
    await expect(branchRow(page, 'checked out develop')).toBeVisible();
  });

  test('the checked-out branch can be dragged too', async ({ page }) => {
    await branchRow(page, 'checked out main').dragTo(branchRow(page, 'develop'));
    await page.getByRole('menuitem', { name: 'Rebase main onto develop', exact: true }).click();
    await expect(page.getByText('Rebased onto develop')).toBeVisible();
  });

  test('branch labels in the graph drag onto each other', async ({ page }) => {
    await graphLabel(page, 'develop').dragTo(graphLabel(page, 'main'));
    await page.getByRole('menuitem', { name: 'Merge develop into main' }).click();
    await expect(page.getByText('Merged develop')).toBeVisible();
  });

  test('dropping on a remote branch only offers changing the dragged one', async ({ page }) => {
    const remote = page
      .getByRole('navigation', { name: 'Branches' })
      .getByRole('tree', { name: 'Remote branches' })
      .getByRole('button', { name: /^develop/ });
    await branchRow(page, 'login').dragTo(remote);
    await expect(
      page.getByRole('menuitem', { name: 'Rebase feature/login onto origin/develop', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Merge .* into origin/ })).toHaveCount(0);
  });
});
