import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock remote lives on https://git.example.internal (project team/demo)
// with one open merge request (!7, develop → main) and one issue. The token
// "wrong" is refused.
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });

async function connect(page: Page, token: string) {
  await sidebar(page).getByRole('button', { name: 'Connect https://git.example.internal' }).click();
  const bar = page.getByRole('form', { name: /^Connect https:\/\/git\.example\.internal/ });
  await bar.getByLabel('Access token').fill(token);
  await bar.getByLabel('Access token').press('Enter');
  return bar;
}

test.describe('code review servers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test('connects with a token and lists merge requests and issues', async ({ page }) => {
    const bar = await connect(page, 'wrong');
    await expect(bar.getByRole('alert')).toContainText('refused the access token');

    await bar.getByLabel('Access token').fill('glpat-good');
    await bar.getByLabel('Access token').press('Enter');
    await expect(page.getByText('Connected https://git.example.internal')).toBeVisible();

    const requests = sidebar(page).getByRole('list', { name: 'Merge requests' });
    await expect(requests).toContainText('!7 Add the login form');
    await expect(sidebar(page).getByRole('list', { name: 'Issues' })).toContainText(
      '#3 Graph flickers',
    );
  });

  test('checks out a merge request by double-clicking it', async ({ page }) => {
    await connect(page, 'glpat-good');
    await sidebar(page)
      .getByRole('list', { name: 'Merge requests' })
      .getByRole('button', { name: /!7/ })
      .dblclick();
    await expect(
      sidebar(page)
        .getByRole('tree', { name: 'Local branches' })
        .getByRole('button', { name: /^checked out develop/ }),
    ).toBeVisible();
  });

  test('opens a merge request from the current branch', async ({ page }) => {
    await connect(page, 'glpat-good');
    await sidebar(page)
      .getByRole('button', { name: 'New merge request from the current branch' })
      .click();
    const bar = page.getByRole('form', { name: 'New request from main' });
    await expect(bar.getByLabel('Target branch')).toHaveValue('develop');
    await bar.getByLabel('Title').fill('Ship the release');
    await bar.getByLabel('Title').press('Enter');
    await expect(page.getByText(/^Opened !\d+ — link copied$/)).toBeVisible();
    await expect(sidebar(page).getByRole('list', { name: 'Merge requests' })).toContainText(
      'Ship the release',
    );
  });
});
