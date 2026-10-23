import { useState, type ReactNode } from 'react';
import type { Category } from '@/domain/model';
import { T } from '@/i18n';
import { Button, CategoryIcon } from '@/ui';
import styles from './CategoryPicker.module.css';

/**
 * Category grid as a native radio group: arrow keys move between categories,
 * the most recently used ones come first.
 */
export function CategoryPicker({
  name,
  legend,
  categories,
  byId,
  value,
  onChange,
  limit = 8,
  invalid = false,
  describedBy,
}: {
  readonly name: string;
  readonly legend: ReactNode;
  readonly categories: readonly Category[];
  readonly byId: ReadonlyMap<string, Category>;
  readonly value: string | null;
  readonly onChange: (id: string) => void;
  readonly limit?: number;
  readonly invalid?: boolean;
  readonly describedBy?: string | undefined;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const selectedIndex = categories.findIndex((c) => c.id === value);
  const visible =
    expanded || categories.length <= limit + 1
      ? categories
      : selectedIndex >= limit
        ? [...categories.slice(0, limit - 1), ...categories.slice(selectedIndex, selectedIndex + 1)]
        : categories.slice(0, limit);
  return (
    <fieldset
      className={styles.fieldset}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      <legend className={styles.legend}>{legend}</legend>
      <div className={[styles.grid, invalid ? styles.error : ''].join(' ')}>
        {visible.map((c) => {
          const parent = c.parentId ? byId.get(c.parentId) : undefined;
          return (
            <label key={c.id} className={styles.tile}>
              <input
                type="radio"
                name={name}
                value={c.id}
                checked={value === c.id}
                onChange={() => onChange(c.id)}
              />
              <span className={styles.tileBody}>
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span>
                  {parent ? <span className={styles.parent}>{parent.name}</span> : null}
                  {c.name}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {categories.length > limit + 1 ? (
        <Button
          size="sm"
          variant="ghost"
          className={styles.more}
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <T id="entry.categories.less" />
          ) : (
            <T id="entry.categories.all" values={{ count: categories.length }} />
          )}
        </Button>
      ) : null}
    </fieldset>
  );
}
