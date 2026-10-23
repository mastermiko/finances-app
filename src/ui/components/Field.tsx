import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './Field.module.css';

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly optionalLabel?: ReactNode;
  readonly id?: string;
  readonly className?: string;
  /** The control: receives id, aria-describedby and aria-invalid. */
  readonly children: ReactElement<Record<string, unknown>>;
}

/** Visible label, hint and error message wired to the control (aria-describedby). */
export function Field({
  label,
  hint,
  error,
  optionalLabel,
  id,
  className,
  children,
}: FieldProps): ReactNode {
  const autoId = useId();
  const controlId = id ?? `f${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
        {optionalLabel ? <span className={styles.optional}> {optionalLabel}</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={[styles.control, className ?? ''].join(' ')} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={[styles.control, className ?? ''].join(' ')} {...rest} />;
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={[styles.control, className ?? ''].join(' ')} {...rest} />;
});

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  description,
}: {
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly description?: ReactNode;
}): ReactNode {
  return (
    <label className={styles.checkRow}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {description ? <span className={styles.hint}> {description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}): ReactNode {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchText}>
        <span>{label}</span>
        {description ? (
          <span id={`${id}-d`} className={styles.hint}>
            {description}
          </span>
        ) : null}
      </span>
      <span className={styles.switchTrack} aria-hidden="true" />
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
}

/** Radio group styled as a segmented control (arrow keys work natively). */
export function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}): ReactNode {
  return (
    <div role="radiogroup" aria-label={legend} className={styles.segmented}>
      {options.map((o) => (
        <label key={o.value} className={styles.segment}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>
            {o.icon}
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export { styles as fieldStyles };
