import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Settings2 } from 'lucide-react';

import { OPTIONAL_COLUMNS, useColumnsStore } from '../model/columns';
import styles from './ColumnMenu.module.css';

const ALWAYS_SHOWN = ['Graph', 'Commit message'];

/** Chooses which columns appear next to the graph. */
export function ColumnMenu() {
  const visible = useColumnsStore((state) => state.visible);
  const toggle = useColumnsStore((state) => state.toggle);
  const reset = useColumnsStore((state) => state.reset);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Choose columns">
        <Settings2 size={14} strokeWidth={1.75} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align="end" sideOffset={6}>
          <DropdownMenu.Label className={styles.label}>Columns</DropdownMenu.Label>
          {OPTIONAL_COLUMNS.map(({ id, label }) => (
            <DropdownMenu.CheckboxItem
              key={id}
              className={styles.item}
              checked={visible[id]}
              onCheckedChange={() => {
                toggle(id);
              }}
              onSelect={(event) => {
                // Keep the menu open so several columns can be toggled at once.
                event.preventDefault();
              }}
            >
              <span className={styles.check}>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={2} />
                </DropdownMenu.ItemIndicator>
              </span>
              {label}
            </DropdownMenu.CheckboxItem>
          ))}
          {ALWAYS_SHOWN.map((label) => (
            <DropdownMenu.CheckboxItem
              key={label}
              className={styles.item}
              checked
              disabled
              title="Always shown"
            >
              <span className={styles.check}>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={2} />
                </DropdownMenu.ItemIndicator>
              </span>
              {label}
            </DropdownMenu.CheckboxItem>
          ))}
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item className={styles.item} onSelect={reset}>
            <span className={styles.check} />
            Reset columns to default
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
