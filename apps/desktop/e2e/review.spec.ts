import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// Merge request !7 (develop → main) on the mock GitLab, connected with a
// token, has one comment and two changed files.
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });

async function connect(page: Page) {
  await page.goto('/?mockHosting=token');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await sidebar(page).getByRole('button', { name: 'Connect https://git.example.internal' }).click();
  const bar = page.getByRole('form', { name: /^Connect https:\/\/git\.example\.internal/ });
  await bar.getByLabel('Access token').fill('glpat-good');
  await bar.getByLabel('Access token').press('Enter');
  await expect(sidebar(page).getByRole('list', { name: 'Merge requests' })).toContainText('!7');
}

const openReview = async (page: Page) => {
  await sidebar(page)
    .getByRole('list', { name: 'Merge requests' })
    .getByRole('button', { name: /!7/ })
    .click();
  return page.getByRole('region', { name: 'Review of !7 Add the login form' });
};

test.describe('merge request review', () => {
  test('shows the conversation, takes a comment and an approval', async ({ page }) => {
    await connect(page);
    const review = await openReview(page);

    await expect(review).toContainText('Adds the login form with personal number and password.');
    const comments = review.getByRole('list', { name: 'Comments' });
    await expect(comments).toContainText('Please keep the password out of the logs.');
    await expect(comments).toContainText('src/login.ts:12');

    await review.getByLabel('Comment', { exact: true }).fill('Done, thanks!');
    await review.getByLabel('Comment', { exact: true }).press('Control+Enter');
    await expect(comments).toContainText('Done, thanks!');
    await expect(review.getByLabel('Comment', { exact: true })).toHaveValue('');

    await review.getByRole('button', { name: 'Approve' }).click();
    await expect(review).toContainText('Approved by Git Panther Demo');
  });

  test('opens a changed file and steps back with Escape', async ({ page }) => {
    await connect(page);
    const review = await openReview(page);
    await review.getByRole('tab', { name: 'Files (2)' }).click();
    await review
      .getByRole('list', { name: 'Changed files' })
      .getByRole('button', { name: /src\/app\.ts/ })
      .click();
    await expect(review).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(review).toBeVisible();
    await review.getByRole('tab', { name: 'Commits (3)' }).click();
    await expect(review.getByRole('list', { name: 'Commits' }).getByRole('listitem')).toHaveCount(
      3,
    );
  });

  test('merges on the server with a second click', async ({ page }) => {
    await connect(page);
    const review = await openReview(page);
    await review.getByRole('button', { name: 'Merge' }).click();
    await review.getByRole('button', { name: 'Merge !7 on the server?' }).click();

    await expect(page.getByText('Merged !7 into main')).toBeVisible();
    await expect(review).toBeHidden();
    await expect(sidebar(page).getByRole('list', { name: 'Merge requests' })).not.toContainText(
      '!7',
    );
  });

  test('offers a merge request after pushing a branch that has none', async ({ page }) => {
    await connect(page);
    await sidebar(page)
      .getByRole('tree', { name: 'Local branches' })
      .getByRole('button', { name: /^login/ })
      .dblclick();
    await page.getByRole('button', { name: /^Push/ }).click();
    await page.getByRole('button', { name: 'Open merge request' }).click();
    await expect(page.getByRole('form', { name: 'New request from feature/login' })).toBeVisible();
  });
});
