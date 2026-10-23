import { useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { buildCategoryTree, flattenTree, wouldCreateCycle } from '@/domain/categories/categories';
import { CATEGORY_ICONS, CATEGORY_PALETTE, type Category, type CategoryKind } from '@/domain/model';
import {
  categoryUsage,
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
  CategoryError,
} from '@/data';
import { T, useT } from '@/i18n';
import {
  Badge,
  Button,
  CategoryIcon,
  Dialog,
  Field,
  ICON_COMPONENTS,
  IconButton,
  Section,
  Segmented,
  Select,
  TextInput,
  toast,
} from '@/ui';
import { reportError } from '../shared/actions';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

interface Draft {
  id: string | null;
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  color: string;
  icon: string;
}

export default function CategoriesSettings(): ReactNode {
  const t = useT();
  const data = useAppData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nameError, setNameError] = useState(false);
  const [deleting, setDeleting] = useState<{ category: Category; operations: number } | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const tree = flattenTree(buildCategoryTree(data.categories));
  const usage = new Map<string, number>();
  for (const op of data.operations)
    if (op.categoryId) usage.set(op.categoryId, (usage.get(op.categoryId) ?? 0) + 1);

  const move = (category: Category, delta: number): void => {
    const siblings = data.categories
      .filter((c) => c.parentId === category.parentId)
      .sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((c) => c.id === category.id);
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    const [item] = reordered.splice(index, 1);
    if (item) reordered.splice(target, 0, item);
    const others = data.categories
      .filter((c) => c.parentId !== category.parentId)
      .sort((a, b) => a.order - b.order);
    void reorderCategories([...reordered, ...others].map((c) => c.id));
  };

  const save = async (): Promise<void> => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setNameError(true);
      return;
    }
    try {
      if (draft.id) {
        await updateCategory(draft.id, {
          name: draft.name,
          parentId: draft.parentId,
          color: draft.color,
          icon: draft.icon,
          kind: draft.kind,
        });
      } else {
        await createCategory({
          name: draft.name,
          kind: draft.kind,
          parentId: draft.parentId,
          color: draft.color,
          icon: draft.icon,
        });
      }
      toast(t('settings.saved'), { tone: 'success', duration: 3000 });
      setDraft(null);
    } catch (e) {
      if (e instanceof CategoryError && e.code === 'kindMismatch')
        toast(t('categories.error.kind'), { tone: 'error' });
      else if (e instanceof CategoryError && e.code === 'cycle')
        toast(t('categories.error.cycle'), { tone: 'error' });
      else reportError(e, t);
    }
  };

  const parents = draft
    ? data.categories.filter(
        (c) =>
          c.kind === draft.kind &&
          c.parentId === null &&
          (!draft.id || !wouldCreateCycle(draft.id, c.id, data.categories)),
      )
    : [];

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="categories.intro" />
      </p>
      <div>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() => {
            setNameError(false);
            setDraft({
              id: null,
              name: '',
              kind: 'expense',
              parentId: null,
              color: CATEGORY_PALETTE[data.categories.length % 8]?.light ?? '#2a78d6',
              icon: 'tag',
            });
          }}
        >
          <T id="categories.add" />
        </Button>
      </div>
      {(['expense', 'income'] as const).map((kind) => (
        <Section
          key={kind}
          title={<T id={kind === 'expense' ? 'categories.expense' : 'categories.income'} />}
          panel
        >
          <ul className={styles.list} role="list">
            {tree
              .filter((n) => n.category.kind === kind)
              .map(({ category, depth }) => (
                <li
                  key={category.id}
                  className={[styles.item, depth > 0 ? styles.child : ''].join(' ')}
                >
                  <CategoryIcon icon={category.icon} color={category.color} size="sm" />
                  <span className={styles.itemMain}>
                    <span className={styles.itemTitle}>{category.name}</span>
                    <span className={styles.itemMeta}>
                      <T id="categories.count" values={{ count: usage.get(category.id) ?? 0 }} />
                    </span>
                  </span>
                  {category.archived ? (
                    <Badge>
                      <T id="categories.archived" />
                    </Badge>
                  ) : null}
                  <span className={styles.actions}>
                    <IconButton
                      label={t('categories.moveUp', { name: category.name })}
                      icon={<ArrowUp />}
                      onClick={() => move(category, -1)}
                    />
                    <IconButton
                      label={t('categories.moveDown', { name: category.name })}
                      icon={<ArrowDown />}
                      onClick={() => move(category, 1)}
                    />
                    <IconButton
                      label={t('common.editItem', { name: category.name })}
                      icon={<Pencil />}
                      onClick={() => {
                        setNameError(false);
                        setDraft({
                          id: category.id,
                          name: category.name,
                          kind: category.kind,
                          parentId: category.parentId,
                          color: category.color,
                          icon: category.icon,
                        });
                      }}
                    />
                    <IconButton
                      label={t(category.archived ? 'categories.unarchive' : 'categories.archive', {
                        name: category.name,
                      })}
                      icon={category.archived ? <ArchiveRestore /> : <Archive />}
                      onClick={() =>
                        void updateCategory(category.id, { archived: !category.archived })
                      }
                    />
                    <IconButton
                      label={t('common.deleteItem', { name: category.name })}
                      icon={<Trash2 />}
                      onClick={() => {
                        void categoryUsage(category.id).then((u) => {
                          setReassignTo('');
                          setDeleting({ category, operations: u.operations });
                        });
                      }}
                    />
                  </span>
                </li>
              ))}
          </ul>
        </Section>
      ))}

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={<T id={draft?.id ? 'categories.editTitle' : 'categories.addTitle'} />}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>
              <T id="common.cancel" />
            </Button>
            <Button variant="primary" type="submit" form="categories-form">
              <T id="common.save" />
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            id="categories-form"
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label={<T id="categories.name" />}
              error={nameError ? <T id="categories.error.name" /> : undefined}
            >
              <TextInput
                value={draft.name}
                maxLength={60}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Segmented<CategoryKind>
              name="cat-kind"
              legend={t('categories.kind')}
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind, parentId: null })}
              options={[
                { value: 'expense', label: t('kind.expense') },
                { value: 'income', label: t('kind.income') },
              ]}
            />
            <Field label={<T id="categories.parent" />}>
              <Select
                value={draft.parentId ?? ''}
                onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}
              >
                <option value="">{t('categories.noParent')}</option>
                {parents
                  .filter((c) => c.id !== draft.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <fieldset className={styles.fieldset}>
              <legend>
                <T id="categories.color" />
              </legend>
              <div className={styles.colorRow}>
                {CATEGORY_PALETTE.map((p, i) => (
                  <label key={p.light} className={styles.colorChoice}>
                    <input
                      type="radio"
                      name="cat-color"
                      checked={draft.color.toLowerCase() === p.light}
                      onChange={() => setDraft({ ...draft, color: p.light })}
                      aria-label={t('categories.colorN', { n: i + 1 })}
                    />
                    <CategoryIconSwatch color={p.light} />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend>
                <T id="categories.icon" />
              </legend>
              <div className={styles.iconGrid}>
                {CATEGORY_ICONS.map((icon) => {
                  const Icon = ICON_COMPONENTS[icon];
                  return (
                    <label key={icon} className={styles.iconChoice}>
                      <input
                        type="radio"
                        name="cat-icon"
                        checked={draft.icon === icon}
                        onChange={() => setDraft({ ...draft, icon })}
                        aria-label={icon}
                      />
                      <span>{Icon ? <Icon aria-hidden="true" /> : null}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </form>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={<T id="categories.deleteTitle" values={{ name: deleting?.category.name ?? '' }} />}
        confirmLabel={<T id="common.delete" />}
        onConfirm={() => {
          if (!deleting) return;
          if (deleting.operations > 0 && !reassignTo) return;
          void deleteCategory(deleting.category.id, reassignTo || null)
            .then(() => {
              toast(t('categories.deleted'), { tone: 'success' });
              setDeleting(null);
            })
            .catch((e: unknown) => {
              if (e instanceof CategoryError && e.code === 'needsReassignment')
                toast(t('categories.error.reassign'), { tone: 'error' });
              else reportError(e, t);
            });
        }}
      >
        {deleting && deleting.operations > 0 ? (
          <>
            <p>
              <T id="categories.deleteReassign" values={{ count: deleting.operations }} />
            </p>
            <Field label={<T id="categories.reassignTo" />}>
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">{t('categories.chooseCategory')}</option>
                {data.categories
                  .filter((c) => c.id !== deleting.category.id && c.kind === deleting.category.kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </>
        ) : (
          <p>
            <T id="categories.deleteEmpty" />
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function CategoryIconSwatch({ color }: { color: string }): ReactNode {
  return (
    <span>
      <CategoryIcon icon="tag" color={color} />
    </span>
  );
}
