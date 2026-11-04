import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '../Button/Button';
import styles from './InlinePrompt.module.css';

export interface PromptField {
  label: string;
  initial: string;
  placeholder?: string;
}

interface InlinePromptProps {
  /** What is being asked, e.g. "New branch from main". */
  title: string;
  /** The values asked for; without any the bar just asks to confirm. */
  fields?: readonly PromptField[];
  submitLabel: string;
  /** Styles the submit button as destructive. */
  danger?: boolean;
  /** Extra controls next to the fields, e.g. a "Switch to it" checkbox. */
  extra?: ReactNode;
  error: string | null;
  isPending: boolean;
  /** The trimmed values, in the order of `fields`. */
  onSubmit: (values: string[]) => void;
  onCancel: () => void;
}

/**
 * A one-line bar that asks for values (or a confirmation) without covering
 * the app. Enter submits, Escape cancels.
 */
export function InlinePrompt({
  title,
  fields = [],
  submitLabel,
  danger = false,
  extra,
  error,
  isPending,
  onSubmit,
  onCancel,
}: InlinePromptProps) {
  const id = useId();
  const [values, setValues] = useState(() => fields.map((field) => field.initial));
  const firstRef = useRef<HTMLInputElement>(null);
  // Opened from a menu, the bar must win focus back from it once it closes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      firstRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const ready = values.every((value) => value.trim() !== '');

  return (
    <form
      className={styles.prompt}
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !isPending) onSubmit(values.map((value) => value.trim()));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label className={styles.title} htmlFor={fields.length > 0 ? `${id}-0` : undefined}>
        {title}
      </label>
      {fields.map((field, index) => (
        <input
          key={field.label}
          ref={index === 0 ? firstRef : undefined}
          id={`${id}-${String(index)}`}
          className={styles.input}
          aria-label={field.label}
          value={values[index] ?? ''}
          placeholder={field.placeholder}
          spellCheck={false}
          onFocus={(event) => {
            event.target.select();
          }}
          onChange={(event) => {
            const next = [...values];
            next[index] = event.target.value;
            setValues(next);
          }}
        />
      ))}
      {extra}
      <Button
        type="submit"
        size="sm"
        variant={danger ? 'danger' : 'primary'}
        disabled={!ready || isPending}
        autoFocus={fields.length === 0}
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
