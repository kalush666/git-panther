import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { BINDABLE_COMMANDS, isBindable, type BindableCommandId } from './catalog';

interface ShortcutState {
  /** User changes; `null` removes a shortcut. Defaults apply otherwise. */
  overrides: Partial<Record<BindableCommandId, string | null>>;
  set: (id: BindableCommandId, shortcut: string | null) => void;
  reset: (id: BindableCommandId) => void;
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      overrides: {},
      set: (id, shortcut) => {
        set((state) => ({ overrides: { ...state.overrides, [id]: shortcut } }));
      },
      reset: (id) => {
        set((state) => ({
          overrides: Object.fromEntries(
            Object.entries(state.overrides).filter(([key]) => key !== id),
          ),
        }));
      },
    }),
    { name: 'git-panther.shortcuts' },
  ),
);

/** The shortcut of command `id` after the user's changes, if it has one. */
export function shortcutFor(id: string, overrides: ShortcutState['overrides']): string | null {
  if (!isBindable(id)) return null;
  const override = overrides[id];
  return override === undefined ? BINDABLE_COMMANDS[id].shortcut : override;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/** "Ctrl+Shift+F" for a key press; `null` for a lone modifier. */
export function shortcutOf(event: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [
    // Cmd on macOS counts as Ctrl, so one binding works everywhere.
    event.ctrlKey || event.metaKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    key === ' ' ? 'Space' : key,
  ]
    .filter(Boolean)
    .join('+');
}

/** Whether a shortcut may fire while the user types in a text field. */
export function worksWhileTyping(shortcut: string): boolean {
  // Plain keys and Shift+key type text; anything with Ctrl or Alt does not
  // (except the text-editing classics, left to the field).
  const editing = ['Ctrl+Z', 'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Y'];
  return /^(Ctrl|Alt)\+/.test(shortcut) && !editing.includes(shortcut);
}
