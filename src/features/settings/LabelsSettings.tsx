import { useMemo, useState, type ReactNode } from 'react';
import { labelKey } from '@/domain/common/text';
import type { Operation } from '@/domain/model';
import { groupSimilarLabels } from '@/domain/rules/rules';
import { applyRulesToOperations, deleteRule, putOperations, saveRule } from '@/data';
import { T, useT } from '@/i18n';
import { Button, Checkbox, Section, toast } from '@/ui';
import { reportError } from '../shared/actions';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

/**
 * Groups labels that only differ by case, accents or punctuation ("Café" /
 * "café") and unifies them through "equals" rules (applied now and to future entries).
 */
export default function LabelsSettings(): ReactNode {
  const t = useT();
  const data = useAppData();
  const groups = useMemo(() => groupSimilarLabels(data.operations), [data.operations]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(groups.map((g) => g.key)),
  );
  const [canonical, setCanonical] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const unify = async (): Promise<void> => {
    setBusy(true);
    try {
      const createdRules: string[] = [];
      const before: Operation[] = [];
      for (const group of groups) {
        if (!selected.has(group.key)) continue;
        const target = canonical[group.key] ?? group.canonical;
        const rule = await saveRule({
          name: t('labels.ruleName', { label: target }),
          matchType: 'equals',
          pattern: target,
          actions: { categoryId: null, label: target, addTagIds: [] },
          enabled: true,
        });
        createdRules.push(rule.id);
        const ids = data.operations
          .filter((o) => labelKey(o.label) === group.key && o.label !== target)
          .map((o) => o.id);
        before.push(...(await applyRulesToOperations([rule.id], ids)));
      }
      toast(t('labels.done', { count: before.length, groups: createdRules.length }), {
        tone: 'success',
        action: {
          label: t('common.undo'),
          onAction: async () => {
            await putOperations(before);
            for (const id of createdRules) await deleteRule(id);
          },
        },
      });
    } catch (e) {
      reportError(e, t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <p className={styles.text}>
        <T id="labels.intro" />
      </p>
      {groups.length === 0 ? (
        <Section panel>
          <p className={styles.muted}>
            <T id="labels.none" />
          </p>
        </Section>
      ) : (
        <>
          <Section panel>
            <ul className={styles.list} role="list">
              {groups.map((group) => (
                <li key={group.key} className={styles.item}>
                  <Checkbox
                    label={
                      <span className="visually-hidden">
                        {t('labels.include', { label: group.canonical })}
                      </span>
                    }
                    checked={selected.has(group.key)}
                    onChange={(on) => {
                      const next = new Set(selected);
                      if (on) next.add(group.key);
                      else next.delete(group.key);
                      setSelected(next);
                    }}
                  />
                  <fieldset className={[styles.fieldset, styles.itemMain].join(' ')}>
                    <legend>
                      <T id="labels.groupTitle" values={{ total: group.total }} />
                    </legend>
                    <div className={styles.colorRow}>
                      {group.variants.map((v) => (
                        <label key={v.label} className={styles.actions}>
                          <input
                            type="radio"
                            name={`canon-${group.key}`}
                            checked={(canonical[group.key] ?? group.canonical) === v.label}
                            onChange={() => setCanonical({ ...canonical, [group.key]: v.label })}
                          />
                          <span>{`« ${v.label} » (${v.count})`}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </li>
              ))}
            </ul>
          </Section>
          <div>
            <Button
              variant="primary"
              loading={busy}
              disabled={selected.size === 0}
              onClick={() => void unify()}
            >
              <T id="labels.unify" values={{ count: selected.size }} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
