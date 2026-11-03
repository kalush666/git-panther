import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
};
const group = (page: Page, name: string) => page.getByRole('radiogroup', { name });

test.describe('settings', () => {
  test('changes the theme, interface size and code font, and remembers them', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);

    await group(page, 'Theme').getByLabel('Light').check();
    await group(page, 'Interface size').getByLabel('Large (110%)').check();
    await group(page, 'Code font').getByLabel('Consolas').check();

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(root).toHaveCSS('zoom', '1.1');
    expect(
      await root.evaluate((element) => element.style.getPropertyValue('--gp-font-mono')),
    ).toContain('Consolas');

    await page.reload();
    await openSettings(page);
    await expect(group(page, 'Theme').getByLabel('Light')).toBeChecked();
    await expect(group(page, 'Interface size').getByLabel('Large (110%)')).toBeChecked();
    await expect(root).toHaveCSS('zoom', '1.1');
  });

  test('shares the pull strategy with the sync toolbar', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);
    await group(page, 'Pull').getByLabel('Rebase').check();
    await page.getByRole('button', { name: 'Back' }).click();

    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.getByRole('button', { name: 'Choose how to pull' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Rebase' })).toBeChecked();
  });

  test('checks a git before saving it and asks for a restart', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);
    const input = page.getByRole('textbox', { name: 'Git executable' });

    await input.fill('C:\\tools\\old-git\\git.exe');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByRole('status').first()).toContainText('too old');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('cannot be used as git');

    await page.getByRole('button', { name: 'Browse…' }).click();
    await expect(input).toHaveValue('C:\\Program Files\\Git\\cmd\\git.exe');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Restart Git Panther to use the new git.')).toBeVisible();
  });

  test('lets the user choose a git when none is found', async ({ page }) => {
    await page.goto('/?mockGit=missing');
    await page.getByRole('button', { name: 'Choose git…' }).click();
    await expect(page.getByRole('textbox', { name: 'Git executable' })).toBeVisible();
  });
});
