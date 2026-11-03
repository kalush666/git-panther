import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_COLUMNS, columnTemplate, useColumnsStore } from './columns';

describe('columnTemplate', () => {
  it('always keeps the graph and message columns', () => {
    const none = { refs: false, author: false, date: false, sha: false };
    expect(columnTemplate(none, 60)).toBe('60px minmax(0, 1fr)');
  });

  it('places optional columns around the graph and message', () => {
    const all = { refs: true, author: true, date: true, sha: true };
    expect(columnTemplate(all, 60)).toBe(
      'var(--gp-refs-col-width) 60px minmax(0, 1fr) var(--gp-col-author) var(--gp-col-date) var(--gp-col-sha)',
    );
  });
});

describe('columns store', () => {
  beforeEach(() => {
    useColumnsStore.getState().reset();
  });

  it('starts with the lean default layout', () => {
    expect(useColumnsStore.getState().visible).toEqual(DEFAULT_COLUMNS);
  });

  it('toggles a column and resets to the default', () => {
    useColumnsStore.getState().toggle('author');
    useColumnsStore.getState().toggle('refs');
    expect(useColumnsStore.getState().visible).toMatchObject({ author: true, refs: false });

    useColumnsStore.getState().reset();
    expect(useColumnsStore.getState().visible).toEqual(DEFAULT_COLUMNS);
  });
});
