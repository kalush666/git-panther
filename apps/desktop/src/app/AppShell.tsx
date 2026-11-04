import { Settings } from 'lucide-react';
import { useState } from 'react';

import { CommandPalette, useShortcutDispatcher } from '../features/command-palette';
import { GitRequiredScreen, GitVersionBadge, useGitInstallation } from '../features/git-check';
import { TabBar, useTabsStore } from '../features/repository-tabs';
import { RepositoryView } from '../features/repository-view';
import { SettingsView } from '../features/settings';
import { ThemeMenu } from '../features/theme';
import { WelcomeScreen } from '../features/welcome';
import { useCommands } from '../shared/commands';
import { ipc } from '../shared/ipc';
import { useThemeStore } from '../shared/preferences/theme';
import { Button } from '../shared/ui/Button/Button';
import styles from './AppShell.module.css';

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => {
    setSettingsOpen(true);
  };
  useShortcutDispatcher();
  useAppCommands(() => {
    setSettingsOpen(true);
  });
  return (
    <div className={styles.shell}>
      <header className={styles.titleBar}>
        <span className={styles.productName}>Git Panther</span>
        <div className={styles.tabs}>
          <TabBar />
        </div>
        <div className={styles.titleBarActions}>
          <ThemeMenu />
          <Button
            size="sm"
            variant="ghost"
            aria-label="Settings"
            aria-pressed={settingsOpen}
            title="Settings"
            onClick={() => {
              setSettingsOpen(!settingsOpen);
            }}
          >
            <Settings size={16} strokeWidth={1.75} />
          </Button>
        </div>
      </header>
      <main className={styles.content}>
        {settingsOpen ? (
          <SettingsView
            onClose={() => {
              setSettingsOpen(false);
            }}
          />
        ) : (
          <MainContent onOpenSettings={openSettings} />
        )}
      </main>
      <CommandPalette />
      <footer className={styles.statusBar}>
        <GitVersionBadge />
      </footer>
    </div>
  );
}

/** App-wide commands: settings, theme and switching tabs. */
function useAppCommands(openSettings: () => void) {
  const tabs = useTabsStore((state) => state.tabs);
  const activate = useTabsStore((state) => state.activate);
  const activePath = useTabsStore((state) => state.activePath);
  const openTab = useTabsStore((state) => state.openTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const step = (by: number) => {
    if (tabs.length === 0) return;
    const index = tabs.findIndex((tab) => tab.path === activePath);
    const next = tabs[(index + by + tabs.length) % tabs.length];
    if (next) activate(next.path);
  };
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useCommands('app', [
    { id: 'app.settings', title: 'Open settings', group: 'App', run: openSettings },
    {
      id: 'app.openRepository',
      title: 'Open a repository',
      group: 'App',
      run: () => {
        void ipc.pickFolder('Open a repository').then(async (folder) => {
          if (!folder) return;
          const result = await ipc.openRepository(folder);
          if (result.status === 'ok') openTab({ path: result.data.path, name: result.data.name });
        });
      },
    },
    {
      id: 'tabs.next',
      title: 'Next tab',
      group: 'Tabs',
      enabled: tabs.length > 1,
      run: () => {
        step(1);
      },
    },
    {
      id: 'tabs.previous',
      title: 'Previous tab',
      group: 'Tabs',
      enabled: tabs.length > 1,
      run: () => {
        step(-1);
      },
    },
    {
      id: 'tabs.close',
      title: 'Close the tab',
      group: 'Tabs',
      enabled: activePath !== null,
      run: () => {
        if (activePath) closeTab(activePath);
      },
    },
    {
      id: 'app.toggleTheme',
      title: dark ? 'Switch to the light theme' : 'Switch to the dark theme',
      group: 'App',
      run: () => {
        setPreference(dark ? 'light' : 'dark');
      },
    },
    ...tabs.map((tab) => ({
      id: `tab:${tab.path}`,
      title: tab.name,
      group: 'Switch to tab',
      run: () => {
        activate(tab.path);
      },
    })),
  ]);
}

function MainContent({ onOpenSettings }: { onOpenSettings: () => void }) {
  const installation = useGitInstallation();
  const activePath = useTabsStore((state) => state.activePath);
  const openTab = useTabsStore((state) => state.openTab);
  const closeTab = useTabsStore((state) => state.closeTab);

  if (installation.isPending) {
    return null;
  }
  if (installation.isError || installation.data.status !== 'supported') {
    return <GitRequiredScreen onOpenSettings={onOpenSettings} />;
  }
  if (activePath === null) {
    return (
      <WelcomeScreen
        onOpened={(repository) => {
          openTab({ path: repository.path, name: repository.name });
        }}
      />
    );
  }
  return (
    <RepositoryView
      key={activePath}
      path={activePath}
      onClose={() => {
        closeTab(activePath);
      }}
      onOpenRepository={(path) => {
        void ipc.openRepository(path).then((result) => {
          if (result.status === 'ok') {
            openTab({ path: result.data.path, name: result.data.name });
          }
        });
      }}
    />
  );
}
