import { beforeEach, describe, expect, it } from 'vitest';

import { useTabsStore } from './tabsStore';

const app = { path: 'C:\\repos\\app', name: 'app' };
const api = { path: 'C:\\repos\\api', name: 'api' };
const web = { path: 'C:\\repos\\web', name: 'web' };

const state = () => useTabsStore.getState();

describe('tabs store', () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activePath: null });
  });

  it('opens and activates a new tab', () => {
    state().openTab(app);
    expect(state().tabs).toEqual([app]);
    expect(state().activePath).toBe(app.path);
  });

  it('re-activates instead of duplicating an open repository', () => {
    state().openTab(app);
    state().openTab(api);
    state().openTab(app);
    expect(state().tabs).toEqual([app, api]);
    expect(state().activePath).toBe(app.path);
  });

  it('moves focus to the left neighbour when closing the active tab', () => {
    [app, api, web].forEach((tab) => {
      state().openTab(tab);
    });
    state().activate(api.path);
    state().closeTab(api.path);
    expect(state().activePath).toBe(app.path);
  });

  it('falls back to the right neighbour, then the start page', () => {
    [app, api].forEach((tab) => {
      state().openTab(tab);
    });
    state().activate(app.path);
    state().closeTab(app.path);
    expect(state().activePath).toBe(api.path);
    state().closeTab(api.path);
    expect(state().activePath).toBeNull();
  });

  it('keeps the active tab when closing another one', () => {
    [app, api].forEach((tab) => {
      state().openTab(tab);
    });
    state().closeTab(app.path);
    expect(state().activePath).toBe(api.path);
  });
});
