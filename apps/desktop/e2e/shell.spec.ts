import { expect, test } from './fixtures';

test.describe('app shell', () => {
  test('shows the welcome screen and git version when git is supported', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Git Panther' })).toBeVisible();
    await expect(page.getByText('git 2.52.0')).toBeVisible();
  });

  test('explains that git is required when it is missing', async ({ page }) => {
    await page.goto('/?mockGit=missing');
    await expect(page.getByRole('heading', { name: 'Git is required' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  test('switches between light and dark themes and remembers the choice', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('html');

    await page.getByRole('button', { name: /^Theme:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();
    await expect(root).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: /^Theme:/ }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(root).toHaveAttribute('data-theme', 'dark');
  });
});
