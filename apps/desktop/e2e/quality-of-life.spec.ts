import { expect, test } from './fixtures';

// The mock working copy starts with three unstaged changes.
test.describe('quality of life', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('commits every change with Ctrl+Enter when nothing is staged', async ({ page }) => {
    const form = page
      .getByRole('complementary', { name: 'Working copy' })
      .getByRole('form', { name: 'Commit' });
    await expect(form.getByRole('button', { name: 'Stage all and commit 3 files' })).toBeDisabled();

    await form.getByLabel('Commit summary').fill('Everything at once');
    await form.getByLabel('Commit summary').press('Control+Enter');
    await expect(page.getByRole('button', { name: /Working copy/ })).toBeHidden();
  });

  test('success messages clear themselves', async ({ page }) => {
    await page.getByRole('button', { name: 'Fetch' }).click();
    const done = page.getByRole('status').filter({ hasText: 'Fetched' });
    await expect(done).toBeVisible();
    await expect(done).toBeHidden({ timeout: 8_000 });
  });

  test('auto-fetch can be set in settings', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const choice = page.getByRole('radiogroup', { name: 'Fetch automatically' });
    await expect(choice.getByLabel('Every 10 min')).toBeChecked();
    await choice.getByLabel('Off').check();
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(
      page.getByRole('radiogroup', { name: 'Fetch automatically' }).getByLabel('Off'),
    ).toBeChecked();
  });
});

test.describe('quality of life, round two', () => {
  const panel = (page: import('@playwright/test').Page) =>
    page.getByRole('complementary', { name: 'Working copy' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('keeps an unfinished commit message across reloads', async ({ page }) => {
    await panel(page).getByLabel('Commit summary').fill('Half-written message');
    await page.reload();
    await expect(panel(page).getByLabel('Commit summary')).toHaveValue('Half-written message');
  });

  test('stages with Space, closes the diff with Escape, discards all in two clicks', async ({
    page,
  }) => {
    const readme = panel(page).getByRole('button', { name: 'M README.md', exact: true });
    await readme.focus();
    await page.keyboard.press('Space');
    await expect(panel(page).getByRole('heading', { name: 'Staged files (1)' })).toBeVisible();

    await panel(page).getByRole('button', { name: 'M src/app.ts', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Diff of src/app.ts' })).toBeVisible();
    await page.locator('body').press('Escape');
    await expect(page.getByRole('listbox', { name: 'Commits' })).toBeVisible();

    await panel(page)
      .getByRole('button', { name: /^Discard all unstaged/ })
      .click();
    await panel(page).getByRole('button', { name: 'Discard all?' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Unstaged files (0)' })).toBeVisible();
  });

  test('resizes the side panel and remembers it', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize the side panel' });
    const before = (await panel(page).boundingBox())?.width ?? 0;
    await handle.focus();
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowLeft');
    const after = (await panel(page).boundingBox())?.width ?? 0;
    expect(after).toBeGreaterThan(before + 40);

    await page.reload();
    expect((await panel(page).boundingBox())?.width ?? 0).toBeCloseTo(after, 0);
  });

  test('double-clicking a branch label in the graph checks it out', async ({ page }) => {
    const commits = page.getByRole('listbox', { name: 'Commits' });
    await commits
      .getByTitle(/^develop \(/)
      .first()
      .dblclick();
    await expect(
      page
        .getByRole('tree', { name: 'Local branches' })
        .getByRole('button', { name: /^checked out develop/ }),
    ).toBeVisible();
  });

  test('closes and switches tabs from the keyboard', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /demo/ })).toBeVisible();
    await page.locator('body').press('Control+w');
    await expect(page.getByRole('tab', { name: /demo/ })).toBeHidden();
  });
});
