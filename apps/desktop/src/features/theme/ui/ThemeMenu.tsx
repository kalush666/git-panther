import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import {
  isThemePreference,
  THEME_PREFERENCES,
  useThemeStore,
  type ThemePreference,
} from '../../../shared/preferences/theme';
import styles from './ThemeMenu.module.css';

const ICONS: Record<ThemePreference, LucideIcon> = { system: Monitor, dark: Moon, light: Sun };

export function ThemeMenu() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const currentLabel =
    THEME_PREFERENCES.find((option) => option.value === preference)?.label ?? 'System';
  const CurrentIcon = ICONS[preference];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label={`Theme: ${currentLabel}`}>
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
            {THEME_PREFERENCES.map(({ value, label }) => {
              const Icon = ICONS[value];
              return (
                <DropdownMenu.RadioItem key={value} value={value} className={styles.item}>
                  <Icon size={14} strokeWidth={1.75} />
                  <span className={styles.itemLabel}>{label}</span>
                  <DropdownMenu.ItemIndicator>
                    <Check size={14} strokeWidth={2} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
