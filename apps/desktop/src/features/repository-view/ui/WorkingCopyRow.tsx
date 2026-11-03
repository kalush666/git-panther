import { PencilLine } from 'lucide-react';

import styles from './WorkingCopyRow.module.css';

interface WorkingCopyRowProps {
  changeCount: number;
  isSelected: boolean;
  onSelect: () => void;
}

/** The uncommitted work, shown above the newest commit. */
export function WorkingCopyRow({ changeCount, isSelected, onSelect }: WorkingCopyRowProps) {
  return (
    <button
      type="button"
      className={styles.row}
      data-selected={isSelected}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      <PencilLine size={14} strokeWidth={1.75} aria-hidden />
      <span className={styles.label}>// Working copy</span>
      <span className={styles.count}>
        {changeCount} {changeCount === 1 ? 'change' : 'changes'}
      </span>
    </button>
  );
}
