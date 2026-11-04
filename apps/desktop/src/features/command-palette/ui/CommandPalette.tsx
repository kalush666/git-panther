import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import {
  allCommands,
  shortcutFor,
  useCommandRegistry,
  useCommands,
  useShortcutStore,
  type Command,
} from '../../../shared/commands';
import { fuzzyScore } from '../model/fuzzy';
import styles from './CommandPalette.module.css';

const MAX_RESULTS = 50;

/** Finds and runs any command by typing a few letters of its name. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const sources = useCommandRegistry((state) => state.sources);
  const overrides = useShortcutStore((state) => state.overrides);

  useCommands('command-palette', [
    {
      id: 'palette.open',
      title: 'Open the command palette',
      group: 'App',
      run: () => {
        setQuery('');
        setActive(0);
        setOpen(true);
      },
    },
  ]);

  const results = allCommands(sources)
    .filter((command) => command.id !== 'palette.open')
    .map((command) => ({ command, score: fuzzyScore(query, `${command.group} ${command.title}`) }))
    .filter((result): result is { command: Command; score: number } => result.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ command }) => command);
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    setOpen(false);
    // Let the palette close first, so the command can take focus.
    requestAnimationFrame(command.run);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + results.length) % Math.max(results.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runAt(current);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.palette} aria-describedby={undefined}>
          <Dialog.Title className={styles.srOnly}>Command palette</Dialog.Title>
          <div className={styles.inputRow}>
            <Search size={15} aria-hidden className={styles.icon} />
            <input
              className={styles.input}
              aria-label="Type a command"
              placeholder="Type a command or a branch name…"
              value={query}
              autoFocus
              spellCheck={false}
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={results[current] ? `command-${String(current)}` : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul id="command-results" className={styles.results} role="listbox" aria-label="Commands">
            {results.length === 0 && <li className={styles.empty}>No matching command.</li>}
            {results.map((command, index) => {
              const shortcut = shortcutFor(command.id, overrides);
              return (
                <li
                  key={`${command.group}:${command.id}`}
                  id={`command-${String(index)}`}
                  role="option"
                  aria-selected={index === current}
                  className={styles.result}
                  onMouseEnter={() => {
                    setActive(index);
                  }}
                  onClick={() => {
                    runAt(index);
                  }}
                >
                  <span className={styles.group}>{command.group}</span>
                  <span className={styles.title}>{command.title}</span>
                  {shortcut && <kbd className={styles.shortcut}>{shortcut}</kbd>}
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
