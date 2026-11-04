import { expect, test } from './fixtures';

// The mock reflog holds one commit a hard reset left on no branch.
test.describe('recover lost commits', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox').fill('Recover lost');
    await page.keyboard.press('Enter');
  });

  test('lists only lost commits until asked for all', async ({ page }) => {
    const view = page.getByRole('region', { name: 'Recover lost commits' });
    const entries = view.getByRole('list', { name: 'Recent HEAD positions' }).getByRole('listitem');
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText('Work in progress on the login form');

    await view.getByLabel('Only lost commits').uncheck();
    await expect(entries).toHaveCount(3);
    await expect(view).toContainText('reset: moving to HEAD~1');

    await page.keyboard.press('Escape');
    await expect(view).toBeHidden();
  });

  test('puts a lost commit on a new branch', async ({ page }) => {
    const view = page.getByRole('region', { name: 'Recover lost commits' });
    await view.getByRole('button', { name: 'Create branch' }).click();
    const bar = page.getByRole('form', { name: 'New branch at commit dead0be' });
    await bar.getByLabel('Branch name').fill('rescued');
    await bar.getByLabel('Branch name').press('Enter');
    await expect(page.getByText('Created branch rescued')).toBeVisible();
  });
});
