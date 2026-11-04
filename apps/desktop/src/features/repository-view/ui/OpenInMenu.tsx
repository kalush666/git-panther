import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FolderOpen } from 'lucide-react';

import { useCommands } from '../../../shared/commands';
import { ipc, type OpenTarget } from '../../../shared/ipc';
import { useEditorStore } from '../../../shared/preferences/editor';
import { Button } from '../../../shared/ui/Button/Button';
import menu from './menu.module.css';
import type { Report } from './useBranchActions';

const LABELS: Record<OpenTarget, string> = {
  fileManager: 'File Explorer',
  terminal: 'Terminal',
  editor: 'Code editor',
};

/** "Open in": the repository in the file manager, a terminal or the editor. */
export function OpenInMenu({ path, report }: { path: string; report: Report }) {
  const editor = useEditorStore((state) => state.command);
  const open = (target: OpenTarget) => {
    void ipc.openIn(path, target, editor).then((result) => {
      if (result.status === 'error') report('error', result.error.message);
    });
  };
  useCommands(
    `openIn:${path}`,
    (Object.keys(LABELS) as OpenTarget[]).map((target) => ({
      id: `repository.openIn.${target}`,
      title: `Open in ${LABELS[target]}`,
      group: 'Repository',
      run: () => {
        open(target);
      },
    })),
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="ghost" title="Open the repository in another tool">
          <FolderOpen size={14} aria-hidden />
          Open in
          <ChevronDown size={12} aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menu.content} align="end" sideOffset={6}>
          {(Object.keys(LABELS) as OpenTarget[]).map((target) => (
            <DropdownMenu.Item
              key={target}
              className={menu.item}
              onSelect={() => {
                open(target);
              }}
            >
              {target === 'editor' ? `${LABELS[target]} (${editor})` : LABELS[target]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
