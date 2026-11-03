import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GitInstallationDto } from '../../../shared/ipc';
import { GitRequiredScreen } from './GitRequiredScreen';

const checkGitInstallation = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/ipc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shared/ipc')>()),
  ipc: { checkGitInstallation },
}));

function renderWith(installation: GitInstallationDto, onOpenSettings = vi.fn()) {
  checkGitInstallation.mockResolvedValue({ status: 'ok', data: installation });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GitRequiredScreen onOpenSettings={onOpenSettings} />
    </QueryClientProvider>,
  );
}

describe('GitRequiredScreen', () => {
  it('explains how to install git when it is missing', async () => {
    renderWith({ status: 'missing', minimum: '2.40.0' });
    expect(await screen.findByText(/none was found on your PATH/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('names the found and required versions when git is too old', async () => {
    renderWith({ status: 'unsupported', found: '2.30.1', minimum: '2.40.0' });
    expect(
      await screen.findByText(/Git 2\.30\.1 is installed.*needs 2\.40\.0/),
    ).toBeInTheDocument();
  });

  it('offers to choose a git that is not on PATH', async () => {
    const onOpenSettings = vi.fn();
    renderWith({ status: 'missing', minimum: '2.40.0' }, onOpenSettings);
    (await screen.findByRole('button', { name: 'Choose git…' })).click();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
