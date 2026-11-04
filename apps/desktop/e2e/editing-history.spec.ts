import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// `?mockConflict=merge` starts mid-merge with src/panther.ts conflicted; the
// mock conflict has one conflict between a "common" header and footer.
const commitRow = (page: Page, message: string) =>
  page.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(message) });

test.describe('editing history', () => {
  test('plans and runs an interactive rebase', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await commitRow(page, 'Change number 4996').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Interactive rebase of later commits…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Interactive rebase' });
    const steps = dialog.getByRole('list', { name: 'Rebase steps' }).getByRole('listitem');
    await expect(steps).toHaveCount(5);

    const first = steps.first();
    const firstSha = (await first.locator('select').getAttribute('aria-label'))?.replace(
      'Action for ',
      '',
    );
    await first.getByRole('combobox').selectOption('reword');
    await first.getByRole('textbox').fill('A better message');
    await dialog.getByRole('button', { name: `Move ${firstSha ?? ''} down` }).click();
    await expect(steps.nth(1).getByRole('combobox')).toHaveValue('reword');
    await steps.last().getByRole('combobox').selectOption('drop');

    await dialog.getByRole('button', { name: 'Start rebase' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Rebased the commits after commit \w+$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  });

  test('resolves a conflict in the editor', async ({ page }) => {
    await page.goto('/?mockConflict=merge');
    await page.getByRole('button', { name: /^Open repository/ }).click();
    await page
      .getByRole('region', { name: 'Merge in progress' })
      .getByRole('button', { name: 'src/panther.ts' })
      .click();

    const editor = page.getByRole('region', { name: 'Resolve src/panther.ts' });
    await expect(editor.getByRole('status')).toHaveText('0 of 1 conflicts decided');
    await expect(editor.getByLabel('Result')).toHaveValue(/<<<<<<< mine/);

    await editor.getByRole('radio', { name: 'Both, incoming first' }).click();
    await expect(editor.getByRole('status')).toHaveText('1 of 1 conflicts decided');
    await expect(editor.getByLabel('Result')).toHaveValue(
      /const name = "Git Panther";\nconst version = 2;\nconst name = "Panther";/,
    );

    await editor.getByRole('button', { name: 'Save and mark resolved' }).click();
    await expect(editor).toBeHidden();
    await expect(
      page.getByRole('region', { name: 'Merge in progress' }).getByRole('button', {
        name: 'src/panther.ts',
      }),
    ).toBeHidden();
  });
});
