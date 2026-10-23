import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { fieldStyles } from './Field';
import styles from './Combobox.module.css';

export interface ComboOption {
  readonly id: string;
  readonly label: string;
  readonly render?: ReactNode;
}

export interface ComboboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'onSelect' | 'value'
> {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly ComboOption[];
  readonly onPick: (option: ComboOption) => void;
  readonly listLabel: string;
}

/**
 * Editable combobox with list autocomplete (WAI-ARIA 1.2 pattern):
 * arrows move the active option, Enter picks it, Escape closes the list.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { value, onValueChange, options, onPick, listLabel, onKeyDown, onBlur, className, ...rest },
  ref,
) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = open && options.length > 0;
  const activeOption = visible && active >= 0 ? options[active] : undefined;

  return (
    <div className={styles.wrap}>
      <input
        ref={ref}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
        autoComplete="off"
        className={[fieldStyles.control, className ?? ''].join(' ')}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && options.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a + 1) % options.length);
            return;
          }
          if (e.key === 'ArrowUp' && options.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
            return;
          }
          if (e.key === 'Escape' && visible) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            return;
          }
          if (e.key === 'Enter' && activeOption) {
            e.preventDefault();
            onPick(activeOption);
            setOpen(false);
            setActive(-1);
            return;
          }
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          window.setTimeout(() => setOpen(false), 120);
          onBlur?.(e);
        }}
        {...rest}
      />
      {visible ? (
        <ul id={listId} role="listbox" aria-label={listLabel} className={styles.list}>
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              onPointerDown={(e) => {
                e.preventDefault();
                onPick(o);
                setOpen(false);
                setActive(-1);
              }}
            >
              {o.render ?? <span className={styles.optionMain}>{o.label}</span>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

export { styles as comboboxStyles };
