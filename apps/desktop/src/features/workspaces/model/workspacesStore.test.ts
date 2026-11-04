import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkspacesStore } from './workspacesStore';

describe('workspaces', () => {
  beforeEach(() => {
    useWorkspacesStore.setState({ workspaces: [], selectedId: null });
  });

  it('creates, fills and selects a workspace without duplicate repositories', () => {
    const store = useWorkspacesStore.getState();
    store.create(' Team ', ['C:/a', 'C:/a', 'C:/b']);
    const [team] = useWorkspacesStore.getState().workspaces;
    expect(team?.name).toBe('Team');
    expect(team?.paths).toEqual(['C:/a', 'C:/b']);
    expect(useWorkspacesStore.getState().selectedId).toBe(team?.id);

    useWorkspacesStore.getState().addPaths(team?.id ?? '', ['C:/b', 'C:/c']);
    useWorkspacesStore.getState().removePath(team?.id ?? '', 'C:/a');
    expect(useWorkspacesStore.getState().workspaces[0]?.paths).toEqual(['C:/b', 'C:/c']);
  });

  it('selects the next workspace when the shown one is removed', () => {
    const store = useWorkspacesStore.getState();
    store.create('One', []);
    store.create('Two', []);
    const [one, two] = useWorkspacesStore.getState().workspaces;
    useWorkspacesStore.getState().select(one?.id ?? '');
    useWorkspacesStore.getState().remove(one?.id ?? '');
    expect(useWorkspacesStore.getState().selectedId).toBe(two?.id);
  });
});
