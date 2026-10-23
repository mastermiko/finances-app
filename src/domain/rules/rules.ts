/**
 * Automatic rules: categorise and normalise labels, add tags.
 * contains / equals / startsWith compare normalised keys (case, accents and
 * punctuation insensitive); regex is matched case-insensitively on the raw label.
 */
import { cleanLabel, labelKey } from '../common/text';
import type { Operation, Rule } from '../model/types';

export const MAX_REGEX_LENGTH = 200;

export type RegexCheck =
  { ok: true; regex: RegExp } | { ok: false; error: 'tooLong' | 'invalid' | 'unsafe' };

/**
 * Compiles a user regex defensively. Nested quantifiers such as (a+)+ are
 * rejected to avoid catastrophic backtracking (labels are ≤ 120 chars anyway).
 */
export function compileUserRegex(pattern: string): RegexCheck {
  if (pattern.length > MAX_REGEX_LENGTH) return { ok: false, error: 'tooLong' };
  if (/\([^)]*[+*][^)]*\)\s*[+*{]/.test(pattern)) return { ok: false, error: 'unsafe' };
  try {
    return { ok: true, regex: new RegExp(pattern, 'iu') };
  } catch {
    return { ok: false, error: 'invalid' };
  }
}

export function ruleMatches(rule: Pick<Rule, 'matchType' | 'pattern'>, label: string): boolean {
  switch (rule.matchType) {
    case 'contains': {
      const k = labelKey(rule.pattern);
      return k !== '' && labelKey(label).includes(k);
    }
    case 'equals':
      return labelKey(label) === labelKey(rule.pattern);
    case 'startsWith': {
      const k = labelKey(rule.pattern);
      return k !== '' && labelKey(label).startsWith(k);
    }
    case 'regex': {
      const compiled = compileUserRegex(rule.pattern);
      return compiled.ok && compiled.regex.test(label);
    }
    default:
      return false;
  }
}

export interface RulePatch {
  readonly categoryId?: string;
  readonly label?: string;
  readonly tagIds?: readonly string[];
  readonly matchedRuleIds: readonly string[];
}

export function sortRules(rules: readonly Rule[]): Rule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || (a.createdAt < b.createdAt ? -1 : 1));
}

/**
 * Applies enabled rules in priority order. Label and category are set by the
 * first matching rule that defines them; tags accumulate. A category action is
 * ignored for transfers and when its kind differs from the operation kind.
 */
export function applyRules(
  op: Pick<Operation, 'label' | 'categoryId' | 'tagIds' | 'kind'>,
  rules: readonly Rule[],
  categoryKinds: ReadonlyMap<string, 'expense' | 'income'> = new Map(),
): RulePatch {
  let label: string | undefined;
  let categoryId: string | undefined;
  const tags = new Set(op.tagIds);
  let tagsChanged = false;
  const matched: string[] = [];
  for (const rule of sortRules(rules)) {
    if (!rule.enabled || !ruleMatches(rule, op.label)) continue;
    matched.push(rule.id);
    if (label === undefined && rule.actions.label) {
      const clean = cleanLabel(rule.actions.label);
      if (clean !== op.label) label = clean;
    }
    if (categoryId === undefined && rule.actions.categoryId && op.kind !== 'transfer') {
      const kind = categoryKinds.get(rule.actions.categoryId);
      if (kind === undefined || kind === op.kind) {
        if (rule.actions.categoryId !== op.categoryId) categoryId = rule.actions.categoryId;
      }
    }
    for (const t of rule.actions.addTagIds) {
      if (!tags.has(t)) {
        tags.add(t);
        tagsChanged = true;
      }
    }
  }
  return {
    ...(label !== undefined ? { label } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(tagsChanged ? { tagIds: [...tags] } : {}),
    matchedRuleIds: matched,
  };
}

export function patchIsEmpty(patch: RulePatch): boolean {
  return patch.label === undefined && patch.categoryId === undefined && patch.tagIds === undefined;
}

export interface RulePreviewItem {
  readonly operation: Operation;
  readonly patch: RulePatch;
}

/** Operations a rule set would change, for the "preview before retroactive application" screen. */
export function previewRules(
  ops: readonly Operation[],
  rules: readonly Rule[],
  categoryKinds: ReadonlyMap<string, 'expense' | 'income'>,
): RulePreviewItem[] {
  const out: RulePreviewItem[] = [];
  for (const op of ops) {
    if (op.deletedAt !== null) continue;
    const patch = applyRules(op, rules, categoryKinds);
    if (!patchIsEmpty(patch)) out.push({ operation: op, patch });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Label grouping (after import): "Café" / "café", "Carter Cash" / "Carter-Cash"

export interface LabelVariant {
  readonly label: string;
  readonly count: number;
}

export interface LabelGroup {
  readonly key: string;
  readonly canonical: string;
  readonly variants: readonly LabelVariant[];
  readonly total: number;
}

/**
 * Groups labels that share the same normalised key but are spelled differently.
 * The canonical spelling is the most frequent one; ties prefer the variant with
 * a capital first letter and accents, then alphabetical order.
 */
export function groupSimilarLabels(
  ops: readonly Pick<Operation, 'label' | 'deletedAt'>[],
): LabelGroup[] {
  const groups = new Map<string, Map<string, number>>();
  for (const op of ops) {
    if (op.deletedAt !== null || op.label === '') continue;
    const key = labelKey(op.label);
    if (key === '') continue;
    let variants = groups.get(key);
    if (!variants) {
      variants = new Map();
      groups.set(key, variants);
    }
    variants.set(op.label, (variants.get(op.label) ?? 0) + 1);
  }
  const score = (s: string): number =>
    (/^\p{Lu}/u.test(s) ? 2 : 0) + (s.normalize('NFD') !== s ? 1 : 0);
  const out: LabelGroup[] = [];
  for (const [key, variants] of groups) {
    if (variants.size < 2) continue;
    const list = [...variants.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (a, b) =>
          b.count - a.count || score(b.label) - score(a.label) || a.label.localeCompare(b.label),
      );
    out.push({
      key,
      canonical: list[0]?.label ?? key,
      variants: list,
      total: list.reduce((a, v) => a + v.count, 0),
    });
  }
  return out.sort((a, b) => b.total - a.total);
}
