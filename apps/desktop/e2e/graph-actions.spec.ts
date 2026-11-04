import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock backend starts on main, with develop, feature/graph and
// feature/login. Merging feature/graph stops with conflicts. The commit
// "Change number 4988" carries the tag v1.0.0.
const localTree = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('tree', { name: 'Local branches' });
const branchRow = (page: Page, label: string) =>
  localTree(page).getByRole('button', { name: new RegExp(`^${label}`) });
const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });
const status = (page: Page) => page.getByRole('status').filter({ hasNotText: /changes?$/ });
const undoButton = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });

test.describe('graph actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(localTree(page)).toBeVisible();
  });

  test('merges a branch from its menu and undoes it', async ({ page }) => {
    await expect(undoButton(page)).toBeDisabled();
    await branchRow(page, 'develop').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Merge develop into main' }).click();
    await expect(page.getByText('Merged develop')).toBeVisible();

    await expect(undoButton(page)).toHaveAttribute('title', 'Undo: Merge develop (Ctrl+Z)');
    await undoButton(page).click();
    await expect(page.getByText('Undid: Merge develop')).toBeVisible();
    await expect(undoButton(page)).toBeDisabled();
  });

  test('a conflicting merge opens the conflict view', async ({ page }) => {
    await branchRow(page, 'graph').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Merge feature/graph into main' }).click();
    await expect(page.getByRole('alert').first()).toContainText('stopped with conflicts');
    await expect(page.getByRole('region', { name: 'Merge in progress' })).toBeVisible();
  });

  test('dropping a branch on the checked-out one offers merge or rebase', async ({ page }) => {
    await branchRow(page, 'develop').dragTo(branchRow(page, 'checked out main'));
    const dialog = page.getByRole('dialog', { name: 'Combine develop and main' });
    await dialog.getByRole('button', { name: 'Rebase main onto develop' }).click();
    await expect(page.getByText('Rebased onto develop')).toBeVisible();
  });

  test('cherry-picks and hard-resets only after confirming', async ({ page }) => {
    await commitRow(page, 'Change number 4997').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Cherry-pick commit' }).click();
    await expect(page.getByText(/^Cherry-picked /)).toBeVisible();

    await commitRow(page, 'Change number 4997').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Reset main to this commit' }).hover();
    await page.getByRole('menuitem', { name: 'Hard: discard all changes…' }).click();
    const confirm = page.getByRole('dialog', { name: 'Hard reset?' });
    await expect(confirm).toContainText('all uncommitted changes are thrown away');
    await confirm.getByRole('button', { name: 'Reset hard' }).click();
    await expect(page.getByText(/^Reset to \w+ \(hard\)$/)).toBeVisible();
  });

  test('creates, refuses duplicate, and deletes tags', async ({ page }) => {
    await commitRow(page, 'Change number 4988').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create tag here…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create tag' });
    await dialog.getByLabel('Tag name').fill('v1.0.0');
    await dialog.getByRole('button', { name: 'Create tag' }).click();
    await expect(dialog.getByRole('alert')).toContainText('already exists');

    await dialog.getByLabel('Tag name').fill('v2.0.0');
    await dialog.getByRole('button', { name: 'Create tag' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Created tag v2.0.0')).toBeVisible();

    await commitRow(page, 'Change number 4988').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete tag v1.0.0' }).click();
    await expect(page.getByText('Deleted tag v1.0.0')).toBeVisible();
  });

  test('Ctrl+Z undoes a checkout', async ({ page }) => {
    await branchRow(page, 'develop').dblclick();
    await expect(branchRow(page, 'checked out develop')).toBeVisible();
    await expect(undoButton(page)).toBeEnabled();

    await page.keyboard.press('Control+z');
    await expect(branchRow(page, 'checked out main')).toBeVisible();
    await expect(status(page).getByText('Undid: Check out develop')).toBeVisible();
  });
});
