import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const form = (page: Page) => page.getByRole('form', { name: 'Commit' });

async function open(page: Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(form(page)).toBeVisible();
}

test.describe('commit box', () => {
  test('pushes right after committing when asked to', async ({ page }) => {
    await open(page);
    await form(page).getByLabel('Push after committing').check();
    await form(page).getByLabel('Commit summary').fill('Ship it');
    await form(page).getByLabel('Commit summary').press('Control+Shift+Enter');
    await expect(page.getByRole('status').filter({ hasText: /^Pushed$/ })).toBeVisible();
  });

  test('credits a co-author picked from recent authors', async ({ page }) => {
    await open(page);
    await form(page).getByRole('button', { name: 'Add co-author' }).click();
    await form(page).getByLabel('Co-author').fill('Grace Hopper <dev@example.invalid>');
    await form(page).getByLabel('Co-author').press('Enter');
    await expect(form(page).getByLabel('Commit description')).toHaveValue(
      'Co-authored-by: Grace Hopper <dev@example.invalid>',
    );
  });

  test('starts a new message from the commit template', async ({ page }) => {
    await open(page, '?mockTemplate=1');
    await expect(form(page).getByLabel('Commit summary')).toHaveValue('[TICKET-] ');
    await expect(form(page).getByLabel('Commit description')).toHaveValue('Why:');
  });

  test('can skip hooks for one commit', async ({ page }) => {
    await open(page);
    const skip = form(page).getByLabel('Skip hooks');
    await skip.check();
    // Commit one file, so the working copy (and its commit box) stays.
    await page
      .getByRole('complementary', { name: 'Working copy' })
      .getByRole('button', { name: 'Stage README.md' })
      .click();
    await form(page).getByLabel('Commit summary').fill('Quick fix');
    await form(page).getByRole('button', { name: 'Commit 1 file' }).click();
    await expect(form(page).getByLabel('Commit summary')).toHaveValue('');
    await expect(skip).not.toBeChecked();
  });
});
