import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

async function runCommand(page: Page, title: string) {
  await page.keyboard.press('Control+K');
  await page.getByRole('combobox').fill(title);
  await page.keyboard.press('Enter');
}

async function start(page: Page, kind: string, name: string) {
  await runCommand(page, `Start ${kind}`);
  const bar = page.getByRole('form', { name: new RegExp(`^Start a ${kind} from`) });
  await bar.getByLabel('Name').fill(name);
  await bar.getByLabel('Name').press('Enter');
}

test.describe('git flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
  });

  test('starts a feature from develop and finishes it into develop', async ({ page }) => {
    await start(page, 'feature', 'search');
    await expect(page.getByText('Started feature/search from develop')).toBeVisible();

    await runCommand(page, 'Finish feature/search');
    const bar = page.getByRole('form', {
      name: 'Finish feature/search: merge it into develop, then delete it',
    });
    await bar.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('Finished feature/search: merged into develop')).toBeVisible();
  });

  test('finishes a release from its menu, into main tagged and develop', async ({ page }) => {
    await start(page, 'release', '1.4.0');
    await expect(page.getByText('Started release/1.4.0 from develop')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Branches' })
      .getByRole('tree', { name: 'Local branches' })
      .getByRole('button', { name: /1\.4\.0/ })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Finish release…' }).click();
    await page
      .getByRole('form', {
        name: /^Finish release\/1\.4\.0: merge it into main \(tagged 1\.4\.0\)/,
      })
      .getByRole('button', { name: 'Finish' })
      .click();
    await expect(
      page.getByText('Finished release/1.4.0: merged into main and develop, tagged 1.4.0'),
    ).toBeVisible();
  });
});
