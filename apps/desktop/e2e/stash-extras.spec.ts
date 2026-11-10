import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock starts with README.md, src/app.ts and the untracked notes/todo.md changed.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Working copy' });
const stashes = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('list', { name: 'Stashes' });

test.describe('stash extras', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await panel(page)
      .getByRole('button', { name: 'M src/app.ts', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Stash this file' }).click();
    await expect(stashes(page).getByRole('button', { name: 'On main: src/app.ts' })).toBeVisible();
  });

  test('stashes one file and puts it back on its own', async ({ page }) => {
    await expect(
      panel(page).getByRole('button', { name: 'M src/app.ts', exact: true }),
    ).toHaveCount(0);
    await expect(
      panel(page).getByRole('button', { name: 'M README.md', exact: true }),
    ).toBeVisible();

    await stashes(page).getByRole('button', { name: 'On main: src/app.ts' }).click();
    const files = stashes(page).getByRole('list', { name: /^Files in / });
    await files.getByRole('button', { name: 'Restore src/app.ts from this stash' }).click();
    await expect(
      panel(page).getByRole('button', { name: 'M src/app.ts', exact: true }),
    ).toBeVisible();
    await expect(stashes(page).getByRole('button', { name: 'On main: src/app.ts' })).toBeVisible();
  });

  test('renames a stash in place', async ({ page }) => {
    await stashes(page)
      .getByRole('button', { name: 'On main: src/app.ts' })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename…' }).click();
    const field = stashes(page).getByLabel('Stash name');
    await field.fill('Speed experiment');
    await field.press('Enter');
    await expect(stashes(page).getByRole('button', { name: 'Speed experiment' })).toBeVisible();
  });
});
