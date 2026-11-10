import { expect, test } from './fixtures';

// The mock log holds a failed push with pre-push hook output, a git log, a
// commit (all in the demo repository) and a fetch in another repository.
test('the activity log lists git commands with what they printed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  await page.getByRole('button', { name: 'Activity' }).click();

  const panel = page.getByRole('region', { name: 'Activity log' });
  const commands = panel.getByRole('list', { name: 'Git commands' });
  await expect(commands.getByRole('listitem')).toHaveCount(2);
  await expect(commands).toContainText('git push --progress');
  await expect(commands).not.toContainText('git log');

  await commands.getByRole('button', { name: /git push/ }).click();
  await expect(commands).toContainText('pre-push hook: tests failed');
  await expect(commands.getByLabel('Failed')).toHaveCount(1);

  await panel.getByLabel('Only commands that change something').uncheck();
  await expect(commands).toContainText('git log');
  await panel.getByLabel('This repository only').uncheck();
  await expect(commands.getByRole('listitem')).toHaveCount(4);

  await panel.getByRole('button', { name: 'Close the activity log' }).click();
  await expect(panel).toBeHidden();
});
