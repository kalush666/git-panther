import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock's interactive-rebase plan holds the newest non-merge commits of
// main ("Change number 4999" to 4994); older commits are out of its reach.
const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });

test.describe('squash, fixup and reword from the graph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('squashes a commit into its parent in one click, with undo', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Squash into parent' }).click();
    const outcome = page.getByRole('status').filter({ hasText: /into its parent/ });
    await expect(outcome).toHaveText(/^Squashed commit \w+ into its parent/);
    await expect(outcome.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('fixes up a commit into its parent', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Fixup into parent/ }).click();
    await expect(page.getByText(/^Fixed up commit \w+ into its parent$/)).toBeVisible();
  });

  test('rewords a commit from a bar prefilled with its summary', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Reword…' }).click();
    const bar = page.getByRole('form', { name: /^Reword commit/ });
    await expect(bar.getByLabel('Summary')).toHaveValue('Change number 4999');
    await bar.getByLabel('Summary').fill('Describe the change properly');
    await bar.getByLabel('Summary').press('Enter');
    await expect(page.getByText(/^Reworded commit \w+$/)).toBeVisible();
  });

  test('explains why a commit off the current branch cannot be changed', async ({ page }) => {
    await commitRow(page, 'Change number 4992').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Squash into parent' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'is not on main, so it cannot be changed here.',
    );
  });
});
