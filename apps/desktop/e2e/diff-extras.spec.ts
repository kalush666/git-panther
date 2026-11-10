import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock's src/app.ts has two unstaged hunks.
const viewer = (page: Page) => page.getByRole('region', { name: 'Diff of src/app.ts' });

test.describe('diff view extras', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page
      .getByRole('complementary', { name: 'Working copy' })
      .getByRole('button', { name: 'M src/app.ts', exact: true })
      .click();
    await expect(viewer(page)).toBeVisible();
  });

  test('steps through the changes', async ({ page }) => {
    const hunks = viewer(page).locator('[data-hunk]');
    await expect(hunks).toHaveCount(2);
    await expect(viewer(page)).toContainText('1 / 2');

    await viewer(page).getByRole('button', { name: 'Next change' }).click();
    await expect(hunks.nth(0)).toHaveAttribute('data-current', 'true');
    await viewer(page).getByRole('button', { name: 'Next change' }).click();
    await expect(hunks.nth(1)).toHaveAttribute('data-current', 'true');
    await expect(viewer(page)).toContainText('2 / 2');
    await viewer(page).getByRole('button', { name: 'Previous change' }).click();
    await expect(hunks.nth(0)).toHaveAttribute('data-current', 'true');
  });

  test('ignoring whitespace turns staging hunks off, and back on', async ({ page }) => {
    const ignore = viewer(page).getByRole('button', { name: 'Ignore whitespace' });
    await expect(viewer(page).getByRole('button', { name: 'Stage hunk' }).first()).toBeVisible();
    await ignore.click();
    await expect(ignore).toHaveAttribute('aria-pressed', 'true');
    await expect(viewer(page)).toContainText('Spacing changes are hidden');
    await expect(viewer(page).getByRole('button', { name: 'Stage hunk' })).toHaveCount(0);

    await ignore.click();
    await expect(viewer(page).getByRole('button', { name: 'Stage hunk' }).first()).toBeVisible();
  });

  test('wrapping long lines can be turned off and is remembered', async ({ page }) => {
    const wrap = viewer(page).getByRole('button', { name: 'Wrap', exact: true });
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await wrap.click();
    await expect(wrap).toHaveAttribute('aria-pressed', 'false');
    await expect(viewer(page).locator('[data-wrap]')).toHaveAttribute('data-wrap', 'false');

    // The open tab comes back by itself after a reload.
    await page.reload();
    await page
      .getByRole('complementary', { name: 'Working copy' })
      .getByRole('button', { name: 'M src/app.ts', exact: true })
      .click();
    await expect(viewer(page).getByRole('button', { name: 'Wrap', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
