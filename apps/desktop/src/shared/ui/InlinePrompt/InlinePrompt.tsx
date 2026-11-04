import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '../Button/Button';
import styles from './InlinePrompt.module.css';

interface InlinePromptProps {
  /** What is being asked, e.g. "New branch from main". */
  title: string;
  /** Without an input the bar just asks to confirm. */
  input?: { label: string; initial: string; placeholder?: string };
  submitLabel: string;
  /** Styles the submit button as destructive. */
  danger?: boolean;
  /** Extra controls next to the input, e.g. a "Switch to it" checkbox. */
  extra?: ReactNode;
  error: string | null;
  isPending: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * A one-line bar that asks for a name (or a confirmation) without covering
 * the app. Enter submits, Escape cancels.
 */
export function InlinePrompt({
  title,
  input,
  submitLabel,
  danger = false,
  extra,
  error,
  isPending,
  onSubmit,
  onCancel,
}: InlinePromptProps) {
  const id = useId();
  const [value, setValue] = useState(input?.initial ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  // Opened from a menu, the bar must win focus back from it once it closes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const ready = !input || value.trim() !== '';

  return (
    <form
      className={styles.prompt}
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !isPending) onSubmit(value.trim());
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label className={styles.title} htmlFor={input ? id : undefined}>
        {title}
      </label>
      {input && (
        <input
          ref={inputRef}
          id={id}
          className={styles.input}
          aria-label={input.label}
          value={value}
          placeholder={input.placeholder}
          spellCheck={false}
          onFocus={(event) => {
            event.target.select();
          }}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      )}
      {extra}
      <Button
        type="submit"
        size="sm"
        variant={danger ? 'danger' : 'primary'}
        disabled={!ready || isPending}
        autoFocus={!input}
      >
        {submitLabel}
      </Button>
      <button type="button" className={styles.cancel} aria-label="Cancel" onClick={onCancel}>
        <X size={14} aria-hidden />
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
