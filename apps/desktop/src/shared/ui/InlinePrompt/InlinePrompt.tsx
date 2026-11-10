import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '../Button/Button';
import styles from './InlinePrompt.module.css';

export interface PromptField {
  label: string;
  initial: string;
  placeholder?: string;
  /** A password: hidden, and kept exactly as typed. */
  secret?: boolean;
  /** May be left empty. */
  optional?: boolean;
  autoComplete?: string;
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
  /** The values in the order of `fields`, trimmed except for secrets. */
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
  const focusRef = useRef<HTMLInputElement>(null);
  // The first field still to fill gets the cursor, e.g. the password when the
  // user name is remembered.
  const [focusIndex] = useState(() =>
    Math.max(
      0,
      fields.findIndex((field) => field.initial === '' && !field.optional),
    ),
  );
  // Opened from a menu, the bar must win focus back from it once it closes,
  // but never from a field of its own the user already moved to.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const field = focusRef.current;
      if (field && !field.form?.contains(document.activeElement)) field.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const ready = values.every((value, index) => fields[index]?.optional || value.trim() !== '');

  return (
    <form
      className={styles.prompt}
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !isPending) {
          onSubmit(values.map((value, index) => (fields[index]?.secret ? value : value.trim())));
        }
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
          ref={index === focusIndex ? focusRef : undefined}
          id={`${id}-${String(index)}`}
          className={styles.input}
          aria-label={field.label}
          value={values[index] ?? ''}
          placeholder={field.placeholder}
          type={field.secret ? 'password' : 'text'}
          autoComplete={field.autoComplete}
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
