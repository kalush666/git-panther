import { expect, test } from './fixtures';

// Once the mock GitLab is connected, its three newest commits have
// pipelines: running, passed and failed.
test('shows CI pipeline results in the graph once the server is connected', async ({ page }) => {
  await page.goto('/?mockHosting=token');
  await page.getByRole('button', { name: /^Open repository/ }).click();
  const commits = page.getByRole('listbox', { name: 'Commits' });
  await expect(commits.getByRole('option').first()).toBeVisible();
  await expect(commits.getByRole('img', { name: /^Pipeline/ })).toHaveCount(0);

  const sidebar = page.getByRole('navigation', { name: 'Branches' });
  await sidebar.getByRole('button', { name: 'Connect https://git.example.internal' }).click();
  const bar = page.getByRole('form', { name: /^Connect https:\/\/git\.example\.internal/ });
  await bar.getByLabel('Access token').fill('glpat-good');
  await bar.getByLabel('Access token').press('Enter');

  await expect(commits.getByRole('img', { name: 'Pipeline running' })).toHaveCount(1);
  await expect(commits.getByRole('img', { name: 'Pipeline passed' })).toHaveCount(1);
  await expect(commits.getByRole('img', { name: 'Pipeline failed' })).toHaveCount(1);
});
