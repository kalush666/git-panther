import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const view = (page: Page) => page.getByRole('region', { name: 'Workspaces' });

async function createWorkspace(page: Page, name: string) {
  await page.getByRole('button', { name: 'Workspaces' }).click();
  await view(page).getByRole('button', { name: 'New workspace' }).click();
  const bar = page.getByRole('form', { name: 'New workspace with the open tabs' });
  await bar.getByLabel('Workspace name').fill(name);
  await bar.getByLabel('Workspace name').press('Enter');
}

test.describe('workspaces', () => {
  test('groups the open repositories and opens one from its card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await createWorkspace(page, 'Payments team');

    const cards = view(page).getByRole('list', { name: 'Repositories in Payments team' });
    const demo = cards.getByRole('listitem', { name: 'demo' });
    await expect(demo).toContainText('On main');
    await expect(demo).toContainText('connect https://git.example.internal');

    await demo.getByRole('button', { name: 'demo', exact: true }).click();
    await expect(view(page)).toBeHidden();
    await expect(page.getByRole('heading', { name: 'demo' })).toBeVisible();
  });

  test('shows merge requests and issues of connected repositories together', async ({ page }) => {
    await page.goto('/?mockHosting=token');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    const sidebar = page.getByRole('navigation', { name: 'Branches' });
    await sidebar.getByRole('button', { name: 'Connect https://git.example.internal' }).click();
    const bar = page.getByRole('form', { name: /^Connect https:\/\/git\.example\.internal/ });
    await bar.getByLabel('Access token').fill('glpat-good');
    await bar.getByLabel('Access token').press('Enter');

    await createWorkspace(page, 'Team');
    await expect(view(page).getByRole('list', { name: 'Merge requests of demo' })).toContainText(
      '!7 Add the login form',
    );
    await expect(view(page).getByRole('list', { name: 'Issues of demo' })).toContainText(
      '#3 Graph flickers',
    );
  });

  test('remembers workspaces and removes one with a second click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await createWorkspace(page, 'Team');
    await page.reload();

    await page.getByRole('button', { name: 'Workspaces' }).click();
    await expect(view(page).getByLabel('Workspace', { exact: true })).toHaveValue(/.+/);
    await view(page).getByRole('button', { name: 'Remove', exact: true }).click();
    await view(page).getByRole('button', { name: 'Remove Team?' }).click();
    await expect(view(page)).toContainText('A workspace groups repositories');
  });
});
