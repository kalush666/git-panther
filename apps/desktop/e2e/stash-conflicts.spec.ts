import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock working copy starts with README.md and src/app.ts modified and
// notes/todo.md untracked. `?mockConflict=merge` starts mid-merge with
// src/panther.ts and docs/guide.md conflicted.
const header = (page: Page) => page.getByRole('group', { name: 'Stash' });
const stashList = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('list', { name: 'Stashes' });
const workingCopy = (page: Page) => page.getByRole('button', { name: /Working copy/ });
const conflicts = (page: Page) => page.getByRole('region', { name: /in progress|Conflicts/ });

async function openRepository(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(header(page)).toBeVisible();
}

async function stash(page: Page, message: string, includeUntracked = true) {
  await header(page).getByRole('button', { name: 'Stash' }).click();
  const dialog = page.getByRole('dialog', { name: 'Stash changes' });
  await dialog.getByLabel('Message (optional)').fill(message);
  if (!includeUntracked) await dialog.getByLabel('Include new (untracked) files').uncheck();
  await dialog.getByRole('button', { name: 'Stash' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('stash', () => {
  test('stashes everything and pops it back', async ({ page }) => {
    await openRepository(page);
    await stash(page, 'login form');

    await expect(workingCopy(page)).toBeHidden();
    await expect(
      stashList(page).getByRole('button', { name: 'On main: login form' }),
    ).toBeVisible();

    await header(page).getByRole('button', { name: 'Pop' }).click();
    await expect(workingCopy(page)).toContainText('3 changes');
    await expect(stashList(page).getByRole('listitem')).toHaveCount(0);
  });

  test('leaves new files behind unless asked', async ({ page }) => {
    await openRepository(page);
    await stash(page, 'tracked only', false);
    await expect(workingCopy(page)).toContainText('1 change');
  });

  test('explains when there is nothing to stash', async ({ page }) => {
    await openRepository(page);
    await stash(page, 'first');
    await header(page).getByRole('button', { name: 'Stash' }).click();
    const dialog = page.getByRole('dialog', { name: 'Stash changes' });
    await dialog.getByRole('button', { name: 'Stash' }).click();
    await expect(dialog.getByRole('alert')).toContainText('no local changes');
  });

  test('applies, then drops after confirming', async ({ page }) => {
    await openRepository(page);
    await stash(page, 'keep me');
    const entry = stashList(page).getByRole('button', { name: 'On main: keep me' });

    await entry.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Apply stash' }).click();
    await expect(workingCopy(page)).toContainText('3 changes');
    await expect(entry).toBeVisible();

    await entry.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Drop stash…' }).click();
    await page
      .getByRole('dialog', { name: 'Drop stash?' })
      .getByRole('button', { name: 'Drop' })
      .click();
    await expect(entry).toBeHidden();
  });
});

test.describe('conflicts', () => {
  test('resolves every file, then continues the merge', async ({ page }) => {
    await openRepository(page, '?mockConflict=merge');
    await expect(conflicts(page)).toContainText('Merge in progress');
    const continueMerge = conflicts(page).getByRole('button', { name: 'Continue merge' });
    await expect(continueMerge).toBeDisabled();

    await conflicts(page)
      .getByRole('group', { name: 'Resolve src/panther.ts' })
      .getByRole('button', { name: 'Keep mine' })
      .click();
    await conflicts(page)
      .getByRole('group', { name: 'Resolve docs/guide.md' })
      .getByRole('button', { name: 'Mark resolved' })
      .click();

    await expect(conflicts(page)).toContainText('All conflicts are resolved');
    await continueMerge.click();
    await expect(conflicts(page)).toBeHidden();
  });

  test('aborts only after confirming', async ({ page }) => {
    await openRepository(page, '?mockConflict=rebase');
    await conflicts(page).getByRole('button', { name: 'Abort rebase' }).click();
    const dialog = page.getByRole('dialog', { name: 'Abort the rebase?' });
    await dialog.getByRole('button', { name: 'Abort rebase' }).click();
    await expect(conflicts(page)).toBeHidden();
  });
});
