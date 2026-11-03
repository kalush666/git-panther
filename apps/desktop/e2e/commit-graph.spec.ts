import { expect, test } from './fixtures';

// The mock backend serves a 5,000-commit history for every repository.
test.describe('commit graph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(page.getByRole('listbox', { name: 'Commits' })).toBeVisible();
  });

  test('lists commits with their branch and tag labels', async ({ page }) => {
    const commits = page.getByRole('listbox', { name: 'Commits' });
    const first = commits.getByRole('option').first();

    await expect(first).toContainText('Merge topic 0');
    await expect(first).toContainText('main');
    await expect(first).toContainText('origin/main');
    await expect(commits.getByRole('option', { name: /v1\.0\.0/ })).toBeVisible();
  });

  test('shows details for the selected commit and follows the keyboard', async ({ page }) => {
    const commits = page.getByRole('listbox', { name: 'Commits' });
    const details = page.getByRole('complementary', { name: 'Commit details' });
    await expect(details).toContainText('Select a commit');

    await commits.getByRole('option', { name: /Merge topic 5/ }).click();
    await expect(details.getByRole('heading', { name: 'Merge topic 5' })).toBeVisible();

    await commits.press('ArrowDown');
    await expect(details.getByRole('heading', { name: 'Change number 4994' })).toBeVisible();
    await expect(details).toContainText('2 changed files');
  });

  test('loads later pages while scrolling a long history', async ({ page }) => {
    const commits = page.getByRole('listbox', { name: 'Commits' });
    await commits.getByRole('option').first().click();

    await commits.press('End');

    const details = page.getByRole('complementary', { name: 'Commit details' });
    await expect(details.getByRole('heading', { name: 'Change number 1' })).toBeVisible();
    await expect(commits.getByRole('option', { name: /Change number 1\b/ })).toBeVisible();
  });
});
