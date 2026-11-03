import { describe, expect, it } from 'vitest';

import { joinPath, repositoryNameFromUrl } from './clonePaths';

describe('repositoryNameFromUrl', () => {
  it.each([
    ['https://github.com/acme/app.git', 'app'],
    ['https://github.com/acme/app', 'app'],
    ['https://github.com/acme/app/', 'app'],
    ['git@github.com:acme/app.git', 'app'],
    ['git@host:app.git', 'app'],
    ['C:\\repos\\app', 'app'],
    ['  ', ''],
  ])('%s → %s', (url, name) => {
    expect(repositoryNameFromUrl(url)).toBe(name);
  });
});

describe('joinPath', () => {
  it('keeps Windows separators', () => {
    expect(joinPath('C:\\repos\\', 'app')).toBe('C:\\repos\\app');
  });

  it('keeps POSIX separators', () => {
    expect(joinPath('/home/dev/repos', 'app')).toBe('/home/dev/repos/app');
  });
});
