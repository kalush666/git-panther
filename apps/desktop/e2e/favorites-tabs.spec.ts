import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open repositories' });

async function openDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(tabs(page).getByRole('tab', { name: 'demo' })).toBeVisible();
}

/** Clones the mock `app` repository into a second tab. */
async function cloneApp(page: Page) {
  await tabs(page).getByRole('tab', { name: 'Start page' }).click();
  await page.getByRole('button', { name: /^Clone/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Clone a repository' });
  await dialog.getByLabel('Repository URL').fill('https://git.example.internal/team/app.git');
  await dialog.getByRole('button', { name: 'Browse…' }).click();
  await dialog.getByRole('button', { name: 'Clone', exact: true }).click();
  await expect(tabs(page).getByRole('tab', { name: 'app' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

test.describe('favorites, tabs and keys', () => {
  test('stars a repository and opens it with Ctrl+Alt+1', async ({ page }) => {
    await openDemo(page);
    await tabs(page).getByRole('tab', { name: 'Start page' }).click();
    await page.getByRole('button', { name: 'Star demo' }).click();
    const favorites = page.getByRole('region', { name: 'Favorites' });
    await expect(favorites).toContainText('demo');

    await tabs(page).getByRole('button', { name: 'Close demo' }).click();
    await page.keyboard.press('Control+Alt+1');
    await expect(tabs(page).getByRole('tab', { name: 'demo' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('switches tabs with Ctrl+number and reorders them by dragging', async ({ page }) => {
    await openDemo(page);
    await cloneApp(page);
    await page.keyboard.press('Control+1');
    await expect(tabs(page).getByRole('tab', { name: 'demo' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await tabs(page)
      .getByRole('tab', { name: 'app' })
      .dragTo(tabs(page).getByRole('tab', { name: 'demo' }));
    const names = tabs(page).getByRole('tab').filter({ hasNotText: /^$/ });
    await expect(names).toHaveText(['app', 'demo']);
  });

  test('renames a tab in place', async ({ page }) => {
    await openDemo(page);
    await tabs(page).getByRole('tab', { name: 'demo' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename tab…' }).click();
    await tabs(page).getByLabel('Tab name').fill('Payments');
    await tabs(page).getByLabel('Tab name').press('Enter');
    await expect(tabs(page).getByRole('tab', { name: 'Payments' })).toBeVisible();
  });

  test('J and K move through the commits', async ({ page }) => {
    await openDemo(page);
    const commits = page.getByRole('listbox', { name: 'Commits' });
    await commits.getByRole('option', { name: /Change number 4999/ }).click();
    await commits.press('j');
    await expect(commits.getByRole('option', { name: /Change number 4998/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await commits.press('k');
    await expect(commits.getByRole('option', { name: /Change number 4999/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
