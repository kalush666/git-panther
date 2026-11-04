import { useEffect, useState, type ReactNode } from 'react';

import { Button, type ButtonSize, type ButtonVariant } from '../Button/Button';
import styles from './ConfirmButton.module.css';

/** How long the button waits for the second click before resetting. */
const ARMED_MS = 3_000;

interface ConfirmButtonProps {
  /** Shown before the first click. */
  children: ReactNode;
  /** Shown after the first click, asking for the second, e.g. "Discard?". */
  confirmLabel: string;
  /** Accessible name before the first click (for icon-only buttons). */
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Renders a bare icon button (for row actions) instead of a {@link Button}. */
  bare?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}

/**
 * A destructive action that needs a second click on the same spot instead
 * of a dialog. It resets after a few seconds or when focus leaves it.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  label,
  size = 'sm',
  variant = 'ghost',
  bare = false,
  disabled,
  onConfirm,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => {
      setArmed(false);
    }, ARMED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [armed]);

  const onClick = () => {
    if (armed) {
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
    }
  };
  const common = {
    'aria-label': armed ? confirmLabel : label,
    title: armed ? 'Click again to confirm' : label,
    disabled,
    onClick,
    onBlur: () => {
      setArmed(false);
    },
  };

  if (bare) {
    return (
      <button type="button" className={styles.bare} data-armed={armed} {...common}>
        {armed ? <span className={styles.armedText}>{confirmLabel}</span> : children}
      </button>
    );
  }
  return (
    <Button size={size} variant={armed ? 'danger' : variant} {...common}>
      {armed ? confirmLabel : children}
    </Button>
  );
}
