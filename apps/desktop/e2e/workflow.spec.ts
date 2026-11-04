import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const localTree = (page: Page) =>
  page.getByRole('navigation', { name: 'Branches' }).getByRole('tree', { name: 'Local branches' });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Working copy' });

async function openRepository(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await expect(localTree(page)).toBeVisible();
}

test.describe('workflow', () => {
  test('runs commands and checks out branches from the palette', async ({ page }) => {
    await openRepository(page);
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.type('fetch');
    await expect(palette(page).getByRole('option').first()).toContainText('Fetch');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /Fetch/ })).toBeVisible();

    await page.keyboard.press('Control+k');
    await page.keyboard.type('check out develop');
    await page.keyboard.press('Enter');
    await expect(
      localTree(page).getByRole('button', { name: /^checked out develop/ }),
    ).toBeVisible();
  });

  test('stashes with its shortcut, and uses a rebound shortcut', async ({ page }) => {
    await openRepository(page);
    await page.keyboard.press('Control+Shift+S');
    await expect(page.getByRole('button', { name: /Working copy/ })).toBeHidden();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Shortcut for Fetch: Ctrl\+Shift\+F/ }).click();
    await page.keyboard.press('Control+Alt+J');
    await expect(
      page.getByRole('button', { name: /^Shortcut for Fetch: Ctrl\+Alt\+J/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();

    await page.keyboard.press('Control+Alt+J');
    await expect(page.getByRole('status').filter({ hasText: /Fetch/ })).toBeVisible();
  });

  test('edits the commit identity inline and switches profiles in one click', async ({ page }) => {
    await openRepository(page);
    const commitAs = panel(page).getByRole('button', { name: 'Commit as' });
    await expect(commitAs).toContainText('Git Panther Demo <demo@example.internal>');

    await commitAs.click();
    await page.getByRole('menuitem', { name: 'Edit identity for this repository…' }).click();
    const form = panel(page).getByRole('form', { name: 'Commit identity' });
    await form.getByLabel('Name').fill('Dana Work');
    await form.getByLabel('Email').fill('dana@corp.example.internal');
    await form.getByLabel('Signing key (optional)').fill('~/.ssh/id_ed25519.pub');
    await form.getByRole('button', { name: 'Use for this repository' }).click();
    await expect(commitAs).toContainText('Dana Work <dana@corp.example.internal>');
    await expect(commitAs.getByLabel('signed')).toBeVisible();

    await commitAs.click();
    await expect(
      page.getByRole('menuitem', { name: /Dana Work <dana@corp\.example\.internal>/ }),
    ).toBeVisible();
  });
});
