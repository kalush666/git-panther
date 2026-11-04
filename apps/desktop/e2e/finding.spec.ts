import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock history has 5,000 commits named "Change number N" and
// "Merge topic N"; src/app.ts has two unstaged hunks.
const search = (page: Page) => page.getByRole('search');
const commits = (page: Page) => page.getByRole('listbox', { name: 'Commits' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Working copy' });
const localTree = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('tree', { name: 'Local branches' });

test.describe('finding things', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(commits(page)).toBeVisible();
  });

  test('searches commits and jumps between matches', async ({ page }) => {
    await page.keyboard.press('Control+f');
    await expect(search(page).getByLabel('Search commits')).toBeFocused();
    await search(page).getByLabel('Search commits').fill('Merge topic 4');
    await expect(search(page).getByRole('status')).toHaveText(/of \d+/);

    await page.keyboard.press('Enter');
    await expect(commits(page).getByRole('option', { selected: true })).toContainText(
      'Merge topic 4',
    );
    await search(page).getByRole('button', { name: 'Next match' }).click();
    await expect(search(page).getByRole('status')).toHaveText(/^2 of/);

    await search(page).getByLabel('Search commits').fill('no such commit anywhere');
    await expect(search(page).getByRole('status')).toHaveText('No matches');
  });

  test('hides branches and shows them again', async ({ page }) => {
    const develop = localTree(page).getByRole('button', { name: /^develop/ });
    await develop.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Hide in graph' }).click();
    await expect(develop.getByLabel('hidden in graph')).toBeVisible();

    await localTree(page)
      .getByRole('button', { name: /^login/ })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Show only this branch' }).click();
    await expect(page.getByRole('button', { name: /hidden · Show all branches/ })).toBeVisible();

    await page.getByRole('button', { name: /hidden · Show all branches/ }).click();
    await expect(develop.getByLabel('hidden in graph')).toBeHidden();
  });

  test('stages picked lines of a hunk', async ({ page }) => {
    await panel(page).getByRole('button', { name: 'M src/app.ts', exact: true }).click();
    const hunk = page
      .getByRole('region', { name: 'Diff of src/app.ts' })
      .getByRole('region', { name: /@@ -4,3/ });
    await hunk.getByRole('button', { name: /^Pick line .*speed = 2/ }).click();
    await expect(hunk.getByRole('button', { name: 'Stage 1 line' })).toBeVisible();

    await hunk.getByRole('button', { name: 'Stage 1 line' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Staged files (1)' })).toBeVisible();
  });

  test('shows a file history and its blame', async ({ page }) => {
    await panel(page).getByRole('button', { name: 'M src/app.ts', exact: true }).click();
    await page.getByRole('button', { name: 'History' }).click();
    const view = page.getByRole('region', { name: 'History of src/app.ts' });
    await expect(view.getByRole('list', { name: 'Commits that changed this file' })).toBeVisible();

    await view.getByRole('tab', { name: 'Blame' }).click();
    const blame = page.getByRole('region', { name: 'Blame of src/app.ts' });
    await expect(blame.getByText('// src/app.ts')).toBeVisible();

    await blame
      .getByRole('button')
      .filter({ hasText: /^\w{7} / })
      .first()
      .click();
    await expect(page.getByRole('region', { name: 'Diff of src/app.ts' })).toBeVisible();
  });
});
