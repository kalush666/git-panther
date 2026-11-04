import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// With `?mockSync=auth` the mock remote is an HTTPS GitLab that refuses
// fetch, pull and push until the user signs in. The password "wrong" is
// always refused.
const signInDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Sign in to your git server' });

async function fillSignIn(page: Page, password: string) {
  const dialog = signInDialog(page);
  await dialog.getByLabel('Personal number or user name').fill('p9493378');
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('sign in', () => {
  test('signs in from a refused push and retries it', async ({ page }) => {
    await page.goto('/?mockSync=auth');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page.getByRole('button', { name: /^Push/ }).click();
    await expect(page.getByRole('alert')).toContainText('Authentication failed');

    await page.getByRole('button', { name: 'Sign in…' }).click();
    await expect(signInDialog(page).getByLabel('Server')).toHaveValue(
      'https://git.example.internal',
    );
    await fillSignIn(page, 'wrong');
    await expect(signInDialog(page).getByRole('alert')).toContainText('Authentication failed');

    await fillSignIn(page, 'right');
    await expect(signInDialog(page)).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('Pushed');
  });

  test('lists and signs out accounts in settings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText('Not signed in to any server.')).toBeVisible();

    await page.getByRole('button', { name: 'Sign in…' }).click();
    await signInDialog(page).getByLabel('Server').fill('gitlab.example.internal');
    await fillSignIn(page, 'right');

    const accounts = page.getByRole('list', { name: 'Accounts' });
    await expect(accounts).toContainText('p9493378');
    await expect(accounts).toContainText('https://gitlab.example.internal');

    await accounts.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('Not signed in to any server.')).toBeVisible();
  });
});
