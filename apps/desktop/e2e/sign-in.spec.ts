import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// With `?mockSync=auth` the mock remote is an HTTPS GitLab that refuses
// fetch, pull, push and clone until the user signs in. The password "wrong"
// is always refused.
const signInBar = (page: Page, purpose: string) =>
  page.getByRole('form', { name: `Sign in to git.example.internal ${purpose}` });

async function fillSignIn(page: Page, purpose: string, password: string) {
  const bar = signInBar(page, purpose);
  await bar.getByLabel('Personal number or user name').fill('p9493378');
  await bar.getByLabel('Password').fill(password);
  await bar.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('sign in', () => {
  test('asks only for the personal number and password when a push is refused', async ({
    page,
  }) => {
    await page.goto('/?mockSync=auth');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.getByRole('button', { name: /^Push/ }).click();

    // The server comes from the remote; there is nothing to type for it.
    const bar = signInBar(page, 'to push');
    await expect(bar).toBeVisible();
    await expect(bar.getByLabel('Server')).toHaveCount(0);
    await expect(bar.getByLabel('Personal number or user name')).toBeFocused();

    await fillSignIn(page, 'to push', 'wrong');
    await expect(bar.getByRole('alert')).toContainText('Authentication failed');

    await fillSignIn(page, 'to push', 'right');
    await expect(bar).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('Pushed');
  });

  test('remembers the personal number for the next sign-in', async ({ page }) => {
    await page.goto('/?mockSync=auth');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.getByRole('button', { name: /^Push/ }).click();
    await fillSignIn(page, 'to push', 'right');
    await expect(page.getByRole('status')).toHaveText('Pushed');

    // A reload forgets the mock's accounts, so the server refuses again.
    await page.reload();
    await page.getByRole('button', { name: /^Fetch/ }).click();
    const bar = signInBar(page, 'to fetch');
    await expect(bar.getByLabel('Personal number or user name')).toHaveValue('p9493378');
    await expect(bar.getByLabel('Password')).toBeFocused();
  });

  test('cancelling the sign-in clears the refused sync', async ({ page }) => {
    await page.goto('/?mockSync=auth');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.getByRole('button', { name: /^Fetch/ }).click();
    const bar = signInBar(page, 'to fetch');
    await bar.getByLabel('Personal number or user name').press('Escape');
    await expect(bar).toBeHidden();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('signs in from a refused clone, using the server in its URL', async ({ page }) => {
    await page.goto('/?mockSync=auth');
    await page.getByRole('button', { name: /^Clone/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Clone a repository' });
    await dialog.getByLabel('Repository URL').fill('https://git.example.internal/team/app.git');
    await dialog.getByRole('button', { name: 'Browse…' }).click();
    await dialog.getByRole('button', { name: 'Clone', exact: true }).click();

    await fillSignIn(page, 'to clone', 'right');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('tab', { name: 'app' })).toHaveAttribute('aria-selected', 'true');
  });

  test('lists and signs out accounts in settings', async ({ page }) => {
    await page.goto('/?mockSync=auth');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.getByRole('button', { name: /^Push/ }).click();
    await fillSignIn(page, 'to push', 'right');
    await expect(page.getByRole('status')).toHaveText('Pushed');

    await page.getByRole('button', { name: 'Settings' }).click();
    const accounts = page.getByRole('list', { name: 'Accounts' });
    await expect(accounts).toContainText('p9493378');
    await expect(accounts).toContainText('https://git.example.internal');

    await accounts.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText(/Not signed in to any server/)).toBeVisible();
  });
});
