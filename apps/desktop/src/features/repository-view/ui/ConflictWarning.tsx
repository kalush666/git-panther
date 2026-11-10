import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CircleCheck, TriangleAlert } from 'lucide-react';

import { useMergeConflicts } from '../api/useGraph';
import styles from './ConflictWarning.module.css';
import menu from './menu.module.css';

interface ConflictWarningProps {
  path: string;
  branch: string;
  /** The branch it will likely be merged into. */
  target: string;
  onRebase: () => void;
  onMergeIn: () => void;
  onCompare: () => void;
}

/**
 * Says early whether `branch` would merge cleanly into `target`, and if not,
 * which files would conflict, with ways to deal with it now.
 */
export function ConflictWarning({
  path,
  branch,
  target,
  onRebase,
  onMergeIn,
  onCompare,
}: ConflictWarningProps) {
  const conflicts = useMergeConflicts(path, branch, target);
  const files = conflicts.data;
  if (!files) return null;
  if (files.length === 0) {
    return (
      <span className={styles.chip} title={`Checked against ${target}`}>
        <CircleCheck size={12} aria-hidden />
        Merges cleanly into {target}
      </span>
    );
  }
  const count = `${String(files.length)} ${files.length === 1 ? 'file' : 'files'}`;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.chip}
          data-conflicts="true"
          title={`Merging into ${target} would conflict in ${count}`}
        >
          <TriangleAlert size={12} aria-hidden />
          Would conflict with {target} ({count})
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menu.content} align="start" sideOffset={6}>
          <DropdownMenu.Label className={menu.label}>
            Merging {branch} into {target} would conflict in:
          </DropdownMenu.Label>
          <ul className={styles.files} aria-label="Files that would conflict">
            {files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
          <DropdownMenu.Separator className={menu.separator} />
          <DropdownMenu.Item className={menu.item} onSelect={onRebase}>
            Rebase {branch} onto {target} now
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menu.item} onSelect={onMergeIn}>
            Merge {target} into {branch} now
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menu.item} onSelect={onCompare}>
            Compare {branch} with {target}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
