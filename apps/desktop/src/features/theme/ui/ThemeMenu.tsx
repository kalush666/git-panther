import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { useThemeStore, type ThemePreference } from '../model/themeStore';
import styles from './ThemeMenu.module.css';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: LucideIcon;
}

const SYSTEM_OPTION: ThemeOption = { value: 'system', label: 'System', icon: Monitor };

const OPTIONS: readonly ThemeOption[] = [
  SYSTEM_OPTION,
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
];

function isThemePreference(value: string): value is ThemePreference {
  return OPTIONS.some((option) => option.value === value);
}

export function ThemeMenu() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const current = OPTIONS.find((option) => option.value === preference) ?? SYSTEM_OPTION;
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label={`Theme: ${current.label}`}>
        <CurrentIcon size={16} strokeWidth={1.75} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align="end" sideOffset={6}>
          <DropdownMenu.Label className={styles.label}>Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={preference}
            onValueChange={(value) => {
              if (isThemePreference(value)) {
                setPreference(value);
              }
            }}
          >
            {OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem key={value} value={value} className={styles.item}>
                <Icon size={14} strokeWidth={1.75} />
                <span className={styles.itemLabel}>{label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} strokeWidth={2} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
