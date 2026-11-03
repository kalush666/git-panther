import { useId } from 'react';

import styles from './SegmentedControl.module.css';

interface SegmentedControlProps<Value extends string | number> {
  label: string;
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (value: Value) => void;
}

/** A row of mutually exclusive choices, built on native radio buttons. */
export function SegmentedControl<Value extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<Value>) {
  const name = useId();
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            type="radio"
            className={styles.input}
            name={name}
            checked={option.value === value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          <span className={styles.text}>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
