import * as ContextMenu from '@radix-ui/react-context-menu';
import { FolderGit2, House, X } from 'lucide-react';
import { useState } from 'react';

import { useTabsStore } from '../model/tabsStore';
import styles from './TabBar.module.css';

/** Drag-and-drop payload: the dragged tab's index. */
const TAB_DRAG_TYPE = 'application/x-git-panther-tab';

export function TabBar() {
  const tabs = useTabsStore((state) => state.tabs);
  const activePath = useTabsStore((state) => state.activePath);
  const activate = useTabsStore((state) => state.activate);
  const closeTab = useTabsStore((state) => state.closeTab);
  const move = useTabsStore((state) => state.move);
  const rename = useTabsStore((state) => state.rename);
  const [renaming, setRenaming] = useState<string | null>(null);

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
      {tabs.map((tab, index) => {
        const isActive = tab.path === activePath;
        return (
          <div
            key={tab.path}
            className={styles.tab}
            data-active={isActive}
            draggable={renaming !== tab.path}
            onDragStart={(event) => {
              event.dataTransfer.setData(TAB_DRAG_TYPE, String(index));
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(TAB_DRAG_TYPE)) event.preventDefault();
            }}
            onDrop={(event) => {
              const from = Number(event.dataTransfer.getData(TAB_DRAG_TYPE));
              if (Number.isInteger(from) && from !== index) {
                event.preventDefault();
                move(from, index);
              }
            }}
          >
            {renaming === tab.path ? (
              <input
                className={styles.renameInput}
                aria-label="Tab name"
                defaultValue={tab.name}
                autoFocus
                onFocus={(event) => {
                  event.target.select();
                }}
                onBlur={() => {
                  setRenaming(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    rename(tab.path, event.currentTarget.value);
                    setRenaming(null);
                  } else if (event.key === 'Escape') {
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <ContextMenu.Root>
                <ContextMenu.Trigger asChild>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    title={`${tab.path}\nCtrl+${String(index + 1)} · drag to reorder`}
                    className={styles.select}
                    onClick={() => {
                      activate(tab.path);
                    }}
                    onDoubleClick={() => {
                      setRenaming(tab.path);
                    }}
                  >
                    <FolderGit2 size={14} strokeWidth={1.75} aria-hidden />
                    <span className={styles.name}>{tab.name}</span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content
                    className={styles.menu}
                    onCloseAutoFocus={(event) => {
                      event.preventDefault();
                    }}
                  >
                    <ContextMenu.Item
                      className={styles.menuItem}
                      onSelect={() => {
                        setRenaming(tab.path);
                      }}
                    >
                      Rename tab…
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className={styles.menuItem}
                      onSelect={() => {
                        closeTab(tab.path);
                      }}
                    >
                      Close tab
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            )}
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
