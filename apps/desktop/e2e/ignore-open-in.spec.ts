import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Working copy' });
// The file row itself: its kind letter (M, U…), then its path.
const fileRow = (page: Page, label: string) =>
  panel(page).getByRole('button', { name: label, exact: true });

test.describe('ignore and open in', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('ignores an untracked file from its menu', async ({ page }) => {
    await fileRow(page, 'U notes/todo.md').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Ignore all .md files' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Ignore this file' }).click();
    await expect(fileRow(page, 'U notes/todo.md')).toHaveCount(0);
    await expect(panel(page).getByRole('heading', { name: 'Unstaged files (2)' })).toBeVisible();
  });

  test('tracked files offer to stop tracking, not plain ignore', async ({ page }) => {
    await fileRow(page, 'M README.md').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Ignore and stop tracking' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Ignore this file' })).toHaveCount(0);
  });

  test('ignores the folder an untracked file is in', async ({ page }) => {
    await fileRow(page, 'U notes/todo.md').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Ignore the folder notes/' }).click();
    await expect(fileRow(page, 'U notes/todo.md')).toHaveCount(0);
  });

  test('opens the repository in another tool, and explains a missing editor', async ({ page }) => {
    await page.getByRole('button', { name: /^Open in/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Code editor (code)' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'File Explorer' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Code editor').fill('missing-editor');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: /^Open in/ }).click();
    await page.getByRole('menuitem', { name: 'Code editor (missing-editor)' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not start "missing-editor"');
  });
});
