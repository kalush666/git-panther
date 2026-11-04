import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The mock remote lives on https://git.example.internal (project team/demo)
// with one open merge request (!7, develop → main) and one issue. The token
// "wrong" is refused. With `?mockHosting=token` the server takes no
// passwords, so connecting needs an access token.
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Branches' });

async function connect(page: Page, token: string) {
  await sidebar(page).getByRole('button', { name: 'Connect https://git.example.internal' }).click();
  const bar = page.getByRole('form', { name: /^Connect https:\/\/git\.example\.internal/ });
  await expect(bar.getByRole('alert')).toContainText('does not let Git Panther use your sign-in');
  await bar.getByLabel('Access token').fill(token);
  await bar.getByLabel('Access token').press('Enter');
  return bar;
}

test.describe('code review servers with your sign-in', () => {
  test('connects with the personal number and password, no token', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await sidebar(page)
      .getByRole('button', { name: 'Connect https://git.example.internal' })
      .click();

    const bar = page.getByRole('form', {
      name: 'Sign in to git.example.internal to see its merge requests',
    });
    await bar.getByLabel('Personal number or user name').fill('p9493378');
    await bar.getByLabel('Password').fill('right');
    await bar.getByLabel('Password').press('Enter');

    await expect(
      page.getByText('Connected https://git.example.internal with your sign-in'),
    ).toBeVisible();
    await expect(sidebar(page).getByRole('list', { name: 'Merge requests' })).toContainText(
      '!7 Add the login form',
    );
  });
});

test('connects by itself once you are signed in to the server', async ({ page }) => {
  await page.goto('/?mockSync=auth');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  const bar = page.getByRole('form', { name: 'Sign in to git.example.internal to push' });
  await bar.getByLabel('Personal number or user name').fill('p9493378');
  await bar.getByLabel('Password').fill('right');
  await bar.getByLabel('Password').press('Enter');

  await expect(sidebar(page).getByRole('list', { name: 'Merge requests' })).toContainText(
    '!7 Add the login form',
  );
});

test.describe('code review servers with a token', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?mockHosting=token');
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
