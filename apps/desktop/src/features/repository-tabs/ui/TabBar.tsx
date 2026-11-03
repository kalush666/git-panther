import { FolderGit2, House, X } from 'lucide-react';

import { useTabsStore } from '../model/tabsStore';
import styles from './TabBar.module.css';

export function TabBar() {
  const tabs = useTabsStore((state) => state.tabs);
  const activePath = useTabsStore((state) => state.activePath);
  const activate = useTabsStore((state) => state.activate);
  const closeTab = useTabsStore((state) => state.closeTab);

  return (
    <div className={styles.bar} role="tablist" aria-label="Open repositories">
      <button
        type="button"
        role="tab"
        aria-selected={activePath === null}
        aria-label="Start page"
        className={styles.home}
        onClick={() => {
          activate(null);
        }}
      >
        <House size={14} strokeWidth={1.75} />
      </button>
      {tabs.map((tab) => {
        const isActive = tab.path === activePath;
        return (
          <div key={tab.path} className={styles.tab} data-active={isActive}>
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              title={tab.path}
              className={styles.select}
              onClick={() => {
                activate(tab.path);
              }}
            >
              <FolderGit2 size={14} strokeWidth={1.75} aria-hidden />
              <span className={styles.name}>{tab.name}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              className={styles.close}
              onClick={() => {
                closeTab(tab.path);
              }}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
