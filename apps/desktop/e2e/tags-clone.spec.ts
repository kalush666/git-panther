import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// "Change number 4988" carries the tag v1.0.0 in the mock.
const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });

test.describe('tags and clone extras', () => {
  test('creates an annotated tag with a message', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await commitRow(page, 'Change number 4999').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create tag here…' }).click();
    const bar = page.getByRole('form', { name: /^New tag at commit/ });
    await bar.getByLabel('Tag name').fill('v2.0.0');
    await bar.getByLabel('Message').fill('Second release');
    await bar.getByLabel('Message').press('Enter');
    await expect(page.getByText('Created tag v2.0.0')).toBeVisible();
  });

  test('a tag can start a branch or be deleted from the remote', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await commitRow(page, 'Change number 4988').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete tag v1.0.0 from the remote' }).click();
    await expect(page.getByText('Deleted tag v1.0.0 from the remote')).toBeVisible();

    await commitRow(page, 'Change number 4988').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create branch from v1.0.0…' }).click();
    await expect(page.getByRole('form', { name: 'New branch at tag v1.0.0' })).toBeVisible();
  });

  test('a clone can take only recent history', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Clone/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Clone a repository' });
    await dialog.getByLabel('History').fill('50a');
    await expect(dialog.getByLabel('History')).toHaveValue('50');
    await dialog.getByLabel('Repository URL').fill('https://git.example.internal/team/app.git');
    await dialog.getByRole('button', { name: 'Browse…' }).click();
    await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'app' })).toHaveAttribute('aria-selected', 'true');
  });
});
