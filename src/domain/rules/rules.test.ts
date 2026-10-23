import { describe, expect, it } from 'vitest';
import { account, operation, rule } from '@/test/factories';
import {
  applyRules,
  compileUserRegex,
  groupSimilarLabels,
  patchIsEmpty,
  previewRules,
  ruleMatches,
  sortRules,
} from './rules';

const acc = account();

describe('matching', () => {
  it('compares normalised text for contains / equals / startsWith', () => {
    expect(ruleMatches({ matchType: 'contains', pattern: 'cafe' }, 'Café aéroport')).toBe(true);
    expect(ruleMatches({ matchType: 'equals', pattern: 'carter cash' }, 'Carter-Cash')).toBe(true);
    expect(ruleMatches({ matchType: 'startsWith', pattern: 'essence' }, 'Essence Moto')).toBe(true);
    expect(ruleMatches({ matchType: 'startsWith', pattern: '--' }, 'Essence')).toBe(false);
    expect(ruleMatches({ matchType: 'regex', pattern: '^(uber|bolt)\\b' }, 'Uber Eats')).toBe(true);
    expect(ruleMatches({ matchType: 'regex', pattern: '(' }, 'x')).toBe(false);
  });

  it('rejects unsafe or invalid regular expressions', () => {
    expect(compileUserRegex('(a+)+$')).toEqual({ ok: false, error: 'unsafe' });
    expect(compileUserRegex('[')).toEqual({ ok: false, error: 'invalid' });
    expect(compileUserRegex('a'.repeat(201))).toEqual({ ok: false, error: 'tooLong' });
    expect(compileUserRegex('caf[eé]').ok).toBe(true);
  });
});

describe('application', () => {
  const food = '0190a0a0-0000-7000-8000-00000000000f';
  const leisure = '0190a0a0-0000-7000-8000-00000000000a';
  const kinds = new Map<string, 'expense' | 'income'>([
    [food, 'expense'],
    [leisure, 'expense'],
  ]);
  const rules = [
    rule({
      priority: 1,
      pattern: 'café',
      actions: { categoryId: leisure, label: null, addTagIds: ['t2'] },
    }),
    rule({
      priority: 0,
      matchType: 'equals',
      pattern: 'cafe',
      actions: { categoryId: food, label: 'Café', addTagIds: ['t1'] },
    }),
    rule({
      priority: 2,
      pattern: 'café',
      enabled: false,
      actions: { categoryId: null, label: 'Ignored', addTagIds: [] },
    }),
  ];

  it('applies by priority: first label/category wins, tags accumulate', () => {
    const patch = applyRules(
      { label: 'cafe', categoryId: null, tagIds: [], kind: 'expense' },
      rules,
      kinds,
    );
    expect(patch).toMatchObject({ label: 'Café', categoryId: food, tagIds: ['t1', 't2'] });
    expect(patch.matchedRuleIds).toHaveLength(2);
    expect(sortRules(rules)[0]?.priority).toBe(0);
  });

  it('never sets a category of another kind nor on transfers', () => {
    expect(
      applyRules({ label: 'cafe', categoryId: null, tagIds: [], kind: 'income' }, rules, kinds)
        .categoryId,
    ).toBeUndefined();
    expect(
      applyRules({ label: 'cafe', categoryId: null, tagIds: [], kind: 'transfer' }, rules, kinds)
        .categoryId,
    ).toBeUndefined();
    expect(
      patchIsEmpty(
        applyRules({ label: 'loyer', categoryId: null, tagIds: [], kind: 'expense' }, rules, kinds),
      ),
    ).toBe(true);
  });

  it('previews the operations a rule would change', () => {
    const ops = [
      operation({ accountId: acc.id, label: 'cafe', categoryId: food }),
      operation({ accountId: acc.id, label: 'Loyer' }),
      operation({ accountId: acc.id, label: 'cafe', deletedAt: '2026-10-01T00:00:00.000Z' }),
    ];
    expect(previewRules(ops, rules, kinds)).toHaveLength(1);
  });
});

describe('label grouping', () => {
  it('groups spellings that only differ by case, accents or punctuation', () => {
    const ops = ['Café', 'café', 'Café', 'Carter Cash', 'Carter-Cash', 'Loyer', ''].map(
      (label) => ({ label, deletedAt: null }),
    );
    const groups = groupSimilarLabels(ops);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: 'cafe', canonical: 'Café', total: 3 });
    expect(groups[1]?.canonical).toBe('Carter Cash');
  });
});
