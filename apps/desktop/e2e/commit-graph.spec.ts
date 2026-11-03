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
    // origin/main is folded into the local main label.
    await expect(first.getByTitle('main (local, origin)')).toBeVisible();
    await expect(first.getByLabel('checked out')).toBeVisible();
    await expect(commits.getByTitle('Tag v1.0.0')).toBeVisible();
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

test.describe('graph columns', () => {
  test('shows optional columns on demand and remembers the choice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(page.getByText('Commit message', { exact: true })).toBeVisible();
    await expect(page.getByText('Author', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Choose columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Author' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'SHA' }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Graph' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.keyboard.press('Escape');

    const firstRow = page.getByRole('listbox', { name: 'Commits' }).getByRole('option').first();
    await expect(page.getByText('Author', { exact: true })).toBeVisible();
    await expect(firstRow).toContainText('Ada Byron');

    await page.reload();
    await expect(page.getByText('Author', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Choose columns' }).click();
    await page.getByRole('menuitem', { name: 'Reset columns to default' }).click();
    await expect(page.getByText('Author', { exact: true })).toHaveCount(0);
  });
});
