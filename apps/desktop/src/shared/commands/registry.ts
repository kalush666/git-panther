import { useEffect, useLayoutEffect, useRef } from 'react';
import { create } from 'zustand';

/** Something the user can do from the command palette (and maybe a shortcut). */
export interface Command {
  /** Stable id; a {@link BindableCommandId} gives it a keyboard shortcut. */
  id: string;
  title: string;
  /** Groups the palette, e.g. "Repository" or "Check out". */
  group: string;
  run: () => void;
  /** Hidden from the palette and shortcuts while `false`. */
  enabled?: boolean;
}

interface RegistryState {
  /** Commands by the component that registered them. */
  sources: Record<string, readonly Command[]>;
  set: (source: string, commands: readonly Command[]) => void;
  remove: (source: string) => void;
}

export const useCommandRegistry = create<RegistryState>()((set) => ({
  sources: {},
  set: (source, commands) => {
    set((state) => ({ sources: { ...state.sources, [source]: commands } }));
  },
  remove: (source) => {
    set((state) => ({
      sources: Object.fromEntries(Object.entries(state.sources).filter(([key]) => key !== source)),
    }));
  },
}));

/** Every enabled command, in registration order. */
export function allCommands(sources: Record<string, readonly Command[]>): Command[] {
  return Object.values(sources)
    .flat()
    .filter((command) => command.enabled !== false);
}

/** What the palette needs to know to show a command; changes trigger a re-registration. */
const signature = (commands: readonly Command[]) =>
  commands
    .map(({ id, title, group, enabled }) => `${id}|${title}|${group}|${String(enabled)}`)
    .join('\n');

/**
 * Registers `commands` while the calling component is mounted. Their `run`
 * functions may change every render; the latest ones are always called.
 */
export function useCommands(source: string, commands: readonly Command[]): void {
  const latest = useRef(commands);
  useLayoutEffect(() => {
    latest.current = commands;
  });
  const key = signature(commands);

  useEffect(() => {
    const { set } = useCommandRegistry.getState();
    set(
      source,
      latest.current.map((command, index) => ({
        ...command,
        run: () => {
          latest.current[index]?.run();
        },
      })),
    );
  }, [source, key]);

  useEffect(
    () => () => {
      useCommandRegistry.getState().remove(source);
    },
    [source],
  );
}
