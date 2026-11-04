/**
 * Every command that can have a keyboard shortcut, with its default. Kept in
 * one place so Settings can list and rebind them even while the screen that
 * runs a command is not open.
 */
export const BINDABLE_COMMANDS = {
  'palette.open': { title: 'Open the command palette', shortcut: 'Ctrl+K' },
  'repository.undo': { title: 'Undo', shortcut: 'Ctrl+Z' },
  'repository.search': { title: 'Search commits', shortcut: 'Ctrl+F' },
  'repository.fetch': { title: 'Fetch', shortcut: 'Ctrl+Shift+F' },
  'repository.pull': { title: 'Pull', shortcut: 'Ctrl+Shift+L' },
  'repository.push': { title: 'Push', shortcut: 'Ctrl+Shift+P' },
  'repository.stash': { title: 'Stash all changes', shortcut: 'Ctrl+Shift+S' },
  'repository.pop': { title: 'Pop the newest stash', shortcut: 'Ctrl+Shift+O' },
  'repository.newBranch': { title: 'New branch here', shortcut: 'Ctrl+B' },
  'repository.stageAll': { title: 'Stage all changes', shortcut: 'Ctrl+Shift+A' },
  'repository.commit': { title: 'Go to the commit message', shortcut: 'Ctrl+Enter' },
  'app.settings': { title: 'Open settings', shortcut: 'Ctrl+,' },
  'app.openRepository': { title: 'Open a repository', shortcut: 'Ctrl+O' },
  'tabs.next': { title: 'Next tab', shortcut: 'Ctrl+Tab' },
  'tabs.previous': { title: 'Previous tab', shortcut: 'Ctrl+Shift+Tab' },
  'tabs.close': { title: 'Close the tab', shortcut: 'Ctrl+W' },
  'app.toggleTheme': { title: 'Switch between light and dark', shortcut: 'Ctrl+Shift+T' },
} as const satisfies Record<string, { title: string; shortcut: string }>;

export type BindableCommandId = keyof typeof BINDABLE_COMMANDS;

export function isBindable(id: string): id is BindableCommandId {
  return id in BINDABLE_COMMANDS;
}
