import { useState } from 'react';

import {
  BINDABLE_COMMANDS,
  shortcutFor,
  shortcutOf,
  useShortcutStore,
  type BindableCommandId,
} from '../../../shared/commands';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './ShortcutsSetting.module.css';

const IDS = Object.keys(BINDABLE_COMMANDS) as BindableCommandId[];

/** Lists every shortcut; click one and press the new keys to change it. */
export function ShortcutsSetting() {
  const overrides = useShortcutStore((state) => state.overrides);
  const set = useShortcutStore((state) => state.set);
  const reset = useShortcutStore((state) => state.reset);
  const [recording, setRecording] = useState<BindableCommandId | null>(null);

  const users = (shortcut: string | null) =>
    shortcut === null ? [] : IDS.filter((id) => shortcutFor(id, overrides) === shortcut);

  return (
    <ul className={styles.list} aria-label="Keyboard shortcuts">
      {IDS.map((id) => {
        const shortcut = shortcutFor(id, overrides);
        const clash = users(shortcut).filter((other) => other !== id);
        const isRecording = recording === id;
        return (
          <li key={id} className={styles.row}>
            <span className={styles.title}>{BINDABLE_COMMANDS[id].title}</span>
            {clash.length > 0 && (
              <span className={styles.clash} role="status">
                Also {BINDABLE_COMMANDS[clash[0] ?? id].title.toLowerCase()}
              </span>
            )}
            <button
              type="button"
              className={styles.key}
              data-recording={isRecording}
              aria-label={`Shortcut for ${BINDABLE_COMMANDS[id].title}: ${shortcut ?? 'none'}. Click to change`}
              onClick={() => {
                setRecording(isRecording ? null : id);
              }}
              onBlur={() => {
                if (isRecording) setRecording(null);
              }}
              onKeyDown={(event) => {
                if (!isRecording) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Escape') {
                  setRecording(null);
                } else if (event.key === 'Backspace' || event.key === 'Delete') {
                  set(id, null);
                  setRecording(null);
                } else {
                  const pressed = shortcutOf(event);
                  if (pressed) {
                    set(id, pressed);
                    setRecording(null);
                  }
                }
              }}
            >
              {isRecording ? 'Press keys… (Backspace clears)' : (shortcut ?? '—')}
            </button>
            {id in overrides && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset(id);
                }}
              >
                Reset
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
