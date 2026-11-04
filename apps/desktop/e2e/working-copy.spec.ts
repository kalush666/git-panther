import { expect, test } from './fixtures';

// The mock backend starts every session with three unstaged files:
// README.md (1 hunk), src/app.ts (2 hunks) and the untracked notes/todo.md.
test.describe('working copy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(page.getByRole('button', { name: /Working copy/ })).toContainText('3 changes');
  });

  const panel = (page: import('@playwright/test').Page) =>
    page.getByRole('complementary', { name: 'Working copy' });

  test('stages and unstages whole files', async ({ page }) => {
    await panel(page).getByRole('button', { name: 'Stage src/app.ts' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Staged files (1)' })).toBeVisible();
    await expect(panel(page).getByRole('heading', { name: 'Unstaged files (2)' })).toBeVisible();

    await panel(page).getByRole('button', { name: 'Unstage all' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Staged files (0)' })).toBeVisible();
  });

  test('stages a single hunk from the diff view', async ({ page }) => {
    await panel(page).getByRole('button', { name: 'M src/app.ts', exact: true }).click();
    const diff = page.getByRole('region', { name: 'Diff of src/app.ts' });
    await expect(diff.getByRole('region', { name: /@@ -4,3/ })).toBeVisible();

    await diff
      .getByRole('region', { name: /@@ -4,3/ })
      .getByRole('button', { name: 'Stage hunk' })
      .click();

    await expect(diff.getByRole('region', { name: /@@ -4,3/ })).toHaveCount(0);
    await expect(diff.getByRole('region', { name: /@@ -40,3/ })).toBeVisible();
    await expect(panel(page).getByRole('heading', { name: 'Staged files (1)' })).toBeVisible();

    await page.getByRole('radio', { name: 'Split' }).click();
    await expect(diff.locator('table[data-layout="split"]')).toBeVisible();
  });

  test('discards a file only after confirming', async ({ page }) => {
    await panel(page).getByRole('button', { name: 'Discard changes to notes/todo.md' }).click();
    // The first click only arms the button; nothing is lost yet.
    await expect(
      panel(page).getByRole('button', { name: 'U notes/todo.md', exact: true }),
    ).toBeVisible();
    await panel(page).getByRole('button', { name: 'Discard?' }).click();

    await expect(panel(page).getByRole('button', { name: 'notes/todo.md' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Working copy/ })).toContainText('2 changes');
  });

  test('commits staged changes', async ({ page }) => {
    const commitButton = panel(page)
      .getByRole('form', { name: 'Commit' })
      .getByRole('button', { name: /^Commit|^Stage all and commit/ });
    await expect(commitButton).toBeDisabled();

    await panel(page).getByRole('button', { name: 'Stage README.md' }).click();
    await panel(page).getByLabel('Commit summary').fill('Polish the README');
    await panel(page).getByRole('button', { name: 'Commit 1 file' }).click();

    await expect(panel(page).getByLabel('Commit summary')).toHaveValue('');
    await expect(panel(page).getByRole('heading', { name: 'Staged files (0)' })).toBeVisible();
  });

  test('prefills the previous message when amending', async ({ page }) => {
    await panel(page).getByLabel('Amend previous commit').check();
    await expect(panel(page).getByLabel('Commit summary')).toHaveValue('Merge topic 0');
    await expect(panel(page).getByRole('button', { name: 'Amend commit' })).toBeEnabled();
  });
});
