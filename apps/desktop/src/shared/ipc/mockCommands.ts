import type { commands, GitInstallationDto } from './bindings';

const MOCK_GIT_PARAM = 'mockGit';

function mockGitInstallation(): GitInstallationDto {
  const scenario = new URLSearchParams(window.location.search).get(MOCK_GIT_PARAM);
  switch (scenario) {
    case 'missing':
      return { status: 'missing', minimum: '2.40.0' };
    case 'unsupported':
      return { status: 'unsupported', found: '2.30.1', minimum: '2.40.0' };
    default:
      return { status: 'supported', version: '2.52.0' };
  }
}

/**
 * Browser-only stand-in for the Rust core. Scenarios are selected with query
 * parameters, e.g. `?mockGit=missing`.
 */
export const mockCommands: typeof commands = {
  checkGitInstallation: () => Promise.resolve({ status: 'ok', data: mockGitInstallation() }),
};
