import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { paletteColor } from '@/domain/model';
import { createTag, deleteTag, updateTag } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Button, ColorSwatch, Field, IconButton, Section, TextInput, toast } from '@/ui';
import { reportError } from '../shared/actions';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

export default function TagsSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const stats = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const op of data.operations) {
      for (const id of op.tagIds) {
        const s = map.get(id) ?? { count: 0, total: 0 };
        s.count += 1;
        if (op.kind !== 'transfer') s.total += op.amountMinor;
        map.set(id, s);
      }
    }
    return map;
  }, [data.operations]);

  const add = (): void => {
    const clean = name.trim();
    if (!clean) return;
    if (data.tags.some((x) => x.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
      toast(t('tags.exists'), { tone: 'warning' });
      return;
    }
    void createTag(clean, paletteColor(data.tags.length))
      .then(() => setName(''))
      .catch((e: unknown) => reportError(e, t));
  };

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="tags.intro" />
      </p>
      <form
        className={styles.actions}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label={<T id="tags.name" />}>
          <TextInput value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" icon={<Plus />}>
          <T id="tags.add" />
        </Button>
      </form>
      <Section panel>
        {data.tags.length === 0 ? (
          <p className={styles.muted}>
            <T id="tags.empty" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {data.tags.map((tag) => {
              const s = stats.get(tag.id) ?? { count: 0, total: 0 };
              return (
                <li key={tag.id} className={styles.item}>
                  <ColorSwatch color={tag.color} />
                  {editing?.id === tag.id ? (
                    <form
                      className={styles.itemMain}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!editing.name.trim()) return;
                        void updateTag(tag.id, { name: editing.name.trim() }).then(() =>
                          setEditing(null),
                        );
                      }}
                    >
                      <TextInput
                        aria-label={t('tags.name')}
                        value={editing.name}
                        autoFocus
                        maxLength={40}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onBlur={() => setEditing(null)}
                      />
                    </form>
                  ) : (
                    <span className={styles.itemMain}>
                      <span className={styles.itemTitle}>{`#${tag.name}`}</span>
                      <span className={styles.itemMeta}>
                        <T id="tags.stats" values={{ count: s.count, total: fmt.money(s.total) }} />
                      </span>
                    </span>
                  )}
                  <span className={styles.actions}>
                    <Link to="/analytics" search={{ tab: 'tags', tag: tag.id }}>
                      <T id="tags.analyse" />
                    </Link>
                    <IconButton
                      label={t('common.editItem', { name: tag.name })}
                      icon={<Pencil />}
                      onClick={() => setEditing({ id: tag.id, name: tag.name })}
                    />
                    <IconButton
                      label={t('common.deleteItem', { name: tag.name })}
                      icon={<Trash2 />}
                      onClick={() => setDeleting(tag.id)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={<T id="tags.deleteTitle" />}
        confirmLabel={<T id="common.delete" />}
        onConfirm={() => {
          if (deleting) void deleteTag(deleting).then(() => setDeleting(null));
        }}
      >
        <p>
          <T id="tags.deleteText" />
        </p>
      </ConfirmDialog>
    </div>
  );
}
