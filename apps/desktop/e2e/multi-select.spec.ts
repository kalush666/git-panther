import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });

test.describe('selecting several commits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('Ctrl-click picks commits that then squash into one', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click();
    await commitRow(page, 'Change number 4998').click({ modifiers: ['Control'] });
    await expect(commitRow(page, 'Change number 4999')).toHaveAttribute('aria-selected', 'true');
    await expect(commitRow(page, 'Change number 4998')).toHaveAttribute('aria-selected', 'true');

    await commitRow(page, 'Change number 4998').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Squash 2 commits' }).click();
    await expect(page.getByText('Squashed 2 commits into one')).toBeVisible();
  });

  test('Shift-click takes a range to cherry-pick together', async ({ page }) => {
    await commitRow(page, 'Change number 4993').click();
    await commitRow(page, 'Change number 4991').click({ modifiers: ['Shift'] });
    await commitRow(page, 'Change number 4992').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Cherry-pick 3 commits' }).click();
    await expect(page.getByText('Cherry-picked 3 commits')).toBeVisible();
  });

  test('two selected commits can be compared', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click();
    await commitRow(page, 'Change number 4996').click({ modifiers: ['Control'] });
    await commitRow(page, 'Change number 4996').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Compare these two commits' }).click();
    await expect(
      page.getByRole('region', { name: /^Review of \w{7} compared with \w{7}$/ }),
    ).toBeVisible();
  });

  test('a plain click goes back to one commit', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click();
    await commitRow(page, 'Change number 4998').click({ modifiers: ['Control'] });
    await commitRow(page, 'Change number 4997').click();
    await expect(commitRow(page, 'Change number 4999')).toHaveAttribute('aria-selected', 'false');
    await commitRow(page, 'Change number 4997').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Cherry-pick commit' })).toBeVisible();
  });
});
