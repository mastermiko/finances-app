import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { compileUserRegex, previewRules, sortRules } from '@/domain/rules/rules';
import type { Rule, RuleMatchType } from '@/domain/model';
import { applyRulesToOperations, deleteRule, putOperations, saveRule } from '@/data';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Field,
  IconButton,
  Section,
  Select,
  Switch,
  TextInput,
  toast,
} from '@/ui';
import { reportError } from '../shared/actions';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

interface Draft {
  id?: string;
  name: string;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  label: string;
  addTagIds: string[];
  enabled: boolean;
  priority?: number;
}

const EMPTY: Draft = {
  name: '',
  matchType: 'contains',
  pattern: '',
  categoryId: '',
  label: '',
  addTagIds: [],
  enabled: true,
};

export default function RulesSettings(): ReactNode {
  const t = useT();
  const data = useAppData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const rules = sortRules(data.rules);

  const move = (rule: Rule, delta: number): void => {
    const index = rules.findIndex((r) => r.id === rule.id);
    const other = rules[index + delta];
    if (!other) return;
    void Promise.all([
      saveRule({
        ...rule,
        priority: other.priority === rule.priority ? other.priority + delta : other.priority,
      }),
      saveRule({ ...other, priority: rule.priority }),
    ]);
  };

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="rules.intro" />
      </p>
      <div>
        <Button variant="primary" icon={<Plus />} onClick={() => setDraft({ ...EMPTY })}>
          <T id="rules.add" />
        </Button>
      </div>
      <Section panel>
        {rules.length === 0 ? (
          <p className={styles.muted}>
            <T id="rules.empty" />
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {rules.map((rule) => (
              <li key={rule.id} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{rule.name}</span>
                  <span className={styles.itemMeta}>
                    {t(`rules.match.${rule.matchType}`)} « {rule.pattern} »{' → '}
                    {[
                      rule.actions.categoryId
                        ? data.categoriesById.get(rule.actions.categoryId)?.name
                        : null,
                      rule.actions.label ? `« ${rule.actions.label} »` : null,
                      ...rule.actions.addTagIds.map(
                        (id) => `#${data.tagsById.get(id)?.name ?? '?'}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </span>
                {!rule.enabled ? (
                  <Badge>
                    <T id="rules.disabled" />
                  </Badge>
                ) : null}
                <span className={styles.actions}>
                  <IconButton
                    label={t('categories.moveUp', { name: rule.name })}
                    icon={<ArrowUp />}
                    onClick={() => move(rule, -1)}
                  />
                  <IconButton
                    label={t('categories.moveDown', { name: rule.name })}
                    icon={<ArrowDown />}
                    onClick={() => move(rule, 1)}
                  />
                  <IconButton
                    label={t('common.editItem', { name: rule.name })}
                    icon={<Pencil />}
                    onClick={() =>
                      setDraft({
                        id: rule.id,
                        name: rule.name,
                        matchType: rule.matchType,
                        pattern: rule.pattern,
                        categoryId: rule.actions.categoryId ?? '',
                        label: rule.actions.label ?? '',
                        addTagIds: [...rule.actions.addTagIds],
                        enabled: rule.enabled,
                        priority: rule.priority,
                      })
                    }
                  />
                  <IconButton
                    label={t('common.deleteItem', { name: rule.name })}
                    icon={<Trash2 />}
                    onClick={() => setDeleting(rule.id)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {draft ? <RuleDialog draft={draft} onClose={() => setDraft(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={<T id="rules.deleteTitle" />}
        confirmLabel={<T id="common.delete" />}
        onConfirm={() => {
          if (deleting) void deleteRule(deleting).then(() => setDeleting(null));
        }}
      >
        <p>
          <T id="rules.deleteText" />
        </p>
      </ConfirmDialog>
    </div>
  );
}

function RuleDialog({ draft: initial, onClose }: { draft: Draft; onClose: () => void }): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const data = useAppData();
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);
  const regexError =
    draft.matchType === 'regex' && draft.pattern ? compileUserRegex(draft.pattern) : null;
  const patternError =
    touched && !draft.pattern.trim()
      ? 'rules.error.pattern'
      : regexError && !regexError.ok
        ? `rules.error.regex.${regexError.error}`
        : null;
  const hasAction = Boolean(draft.categoryId || draft.label.trim() || draft.addTagIds.length > 0);
  const candidate: Rule | null = useMemo(() => {
    if (!draft.pattern.trim() || (regexError && !regexError.ok)) return null;
    const stamp = new Date().toISOString();
    return {
      id: draft.id ?? '00000000-0000-7000-8000-000000000000',
      name: draft.name || draft.pattern,
      matchType: draft.matchType,
      pattern: draft.pattern,
      actions: {
        categoryId: draft.categoryId || null,
        label: draft.label.trim() || null,
        addTagIds: draft.addTagIds,
      },
      priority: 0,
      enabled: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
  }, [draft, regexError]);
  const kinds = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c.kind])),
    [data.categories],
  );
  const preview = useMemo(
    () => (candidate ? previewRules(data.operations, [candidate], kinds) : []),
    [candidate, data.operations, kinds],
  );

  const persist = async (applyNow: boolean): Promise<void> => {
    setTouched(true);
    if (!candidate || !hasAction) return;
    try {
      const saved = await saveRule({
        ...(draft.id ? { id: draft.id } : {}),
        ...(draft.priority !== undefined ? { priority: draft.priority } : {}),
        name: (draft.name || draft.pattern).slice(0, 80),
        matchType: draft.matchType,
        pattern: draft.pattern,
        actions: candidate.actions,
        enabled: draft.enabled,
      });
      if (applyNow && preview.length > 0) {
        const before = await applyRulesToOperations(
          [saved.id],
          preview.map((p) => p.operation.id),
        );
        toast(t('rules.applied', { count: before.length }), {
          tone: 'success',
          action: { label: t('common.undo'), onAction: () => putOperations(before) },
        });
      } else {
        toast(t('settings.saved'), { tone: 'success', duration: 3000 });
      }
      onClose();
    } catch (e) {
      reportError(e, t);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={<T id={draft.id ? 'rules.editTitle' : 'rules.addTitle'} />}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button onClick={onClose}>
            <T id="common.cancel" />
          </Button>
          <Button onClick={() => void persist(false)} disabled={!hasAction}>
            <T id="common.save" />
          </Button>
          <Button
            variant="primary"
            icon={<Play />}
            onClick={() => void persist(true)}
            disabled={!hasAction || preview.length === 0}
          >
            <T id="rules.saveApply" values={{ count: preview.length }} />
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label={<T id="rules.name" />} optionalLabel={<T id="common.optional" />}>
          <TextInput
            value={draft.name}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <div className={styles.grid2}>
          <Field label={<T id="rules.matchType" />}>
            <Select
              value={draft.matchType}
              onChange={(e) => setDraft({ ...draft, matchType: e.target.value as RuleMatchType })}
            >
              {(['contains', 'equals', 'startsWith', 'regex'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`rules.match.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={<T id="rules.pattern" />}
            hint={
              <T
                id={draft.matchType === 'regex' ? 'rules.patternRegexHint' : 'rules.patternHint'}
              />
            }
            error={patternError ? <T id={patternError as 'rules.error.pattern'} /> : undefined}
          >
            <TextInput
              value={draft.pattern}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
              onBlur={() => setTouched(true)}
            />
          </Field>
        </div>
        <fieldset className={styles.fieldset}>
          <legend>
            <T id="rules.actions" />
          </legend>
          <div className={styles.grid2}>
            <Field label={<T id="rules.setCategory" />}>
              <Select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              >
                <option value="">{t('rules.noChange')}</option>
                {data.categories
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.name} (${t(`kind.${c.kind}`)})`}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={<T id="rules.setLabel" />} optionalLabel={<T id="common.optional" />}>
              <TextInput
                value={draft.label}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
          </div>
          {data.tags.length > 0 ? (
            <div className={styles.colorRow}>
              {data.tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  label={`#${tag.name}`}
                  checked={draft.addTagIds.includes(tag.id)}
                  onChange={(on) =>
                    setDraft({
                      ...draft,
                      addTagIds: on
                        ? [...draft.addTagIds, tag.id]
                        : draft.addTagIds.filter((x) => x !== tag.id),
                    })
                  }
                />
              ))}
            </div>
          ) : null}
          {touched && !hasAction ? (
            <p className={styles.muted} role="alert">
              <T id="rules.error.action" />
            </p>
          ) : null}
        </fieldset>
        <Switch
          label={<T id="rules.enabled" />}
          checked={draft.enabled}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
        />
        <section aria-live="polite">
          <h3>
            <T id="rules.preview" values={{ count: preview.length }} />
          </h3>
          {preview.length > 0 ? (
            <ul className={[styles.list, styles.preview].join(' ')} role="list">
              {preview.slice(0, 50).map(({ operation: op, patch }) => (
                <li key={op.id} className={styles.item}>
                  <span className={styles.itemMain}>
                    <span className={styles.itemTitle}>
                      {op.label || '—'}
                      {patch.label ? ` → « ${patch.label} »` : ''}
                    </span>
                    <span className={styles.itemMeta}>
                      {op.date ? fmt.date(op.date) : fmt.period(op.period)} ·{' '}
                      {fmt.money(op.amountMinor)}
                      {patch.categoryId
                        ? ` · ${data.categoriesById.get(op.categoryId ?? '')?.name ?? ''} → ${data.categoriesById.get(patch.categoryId)?.name ?? ''}`
                        : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>
              <T id="rules.previewEmpty" />
            </p>
          )}
        </section>
      </div>
    </Dialog>
  );
}
