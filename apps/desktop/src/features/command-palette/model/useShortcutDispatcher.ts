import { useEffect } from 'react';

import {
  allCommands,
  shortcutFor,
  shortcutOf,
  useCommandRegistry,
  useShortcutStore,
  worksWhileTyping,
} from '../../../shared/commands';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Runs the registered command whose shortcut was pressed, anywhere in the app. */
export function useShortcutDispatcher(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const pressed = shortcutOf(event);
      if (!pressed) return;
      if (isTyping(event.target) && !worksWhileTyping(pressed)) return;
      const { overrides } = useShortcutStore.getState();
      const command = allCommands(useCommandRegistry.getState().sources).find(
        (candidate) => shortcutFor(candidate.id, overrides) === pressed,
      );
      if (command) {
        event.preventDefault();
        command.run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
