import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });

async function runCommand(page: Page, title: string) {
  await page.keyboard.press('Control+K');
  await page.getByRole('combobox').fill(title);
  await page.keyboard.press('Enter');
}

test.describe('patches', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('copies a commit as a patch', async ({ page }) => {
    await commitRow(page, 'Change number 4999').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy as patch' }).click();
    await expect(page.getByText(/^Copied commit \w+ as a patch$/)).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Subject: [PATCH]');
  });

  test('applies a patch from a file', async ({ page }) => {
    await runCommand(page, 'Apply patch from file');
    await expect(page.getByText('Applied fix-login.patch to your changes')).toBeVisible();
  });

  test('applies the patch on the clipboard, and explains text that is none', async ({ page }) => {
    await page.evaluate(() => navigator.clipboard.writeText('just some notes'));
    await runCommand(page, 'Apply patch from clipboard');
    await expect(page.getByRole('alert')).toContainText('No valid patches in input');

    await page.evaluate(() =>
      navigator.clipboard.writeText('diff --git a/src/app.ts b/src/app.ts\n'),
    );
    await runCommand(page, 'Apply patch from clipboard');
    await expect(
      page.getByText('Applied the patch from the clipboard to your changes'),
    ).toBeVisible();
  });
});
