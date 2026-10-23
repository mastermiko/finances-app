import { describe, expect, it } from 'vitest';
import { account, category, exportData, operation } from '@/test/factories';
import { exportDataSchema, operationSchema } from './schemas';
import {
  createDefaultCategories,
  createDefaultSettings,
  createMeta,
  darkVariant,
  migrateData,
  MigrationError,
  paletteColor,
  SCHEMA_VERSION,
} from './index';

describe('schemas', () => {
  it('accepts valid operations and enforces the invariants', () => {
    const acc = account();
    const op = operation({ accountId: acc.id });
    expect(operationSchema.parse(op)).toEqual(op);
    expect(operationSchema.safeParse({ ...op, amountMinor: 0 }).success).toBe(false);
    expect(operationSchema.safeParse({ ...op, amountMinor: 1.5 }).success).toBe(false);
    expect(operationSchema.safeParse({ ...op, categoryId: null }).success).toBe(false);
    expect(operationSchema.safeParse({ ...op, label: ' x' }).success).toBe(false);
    expect(operationSchema.safeParse({ ...op, date: '2025-02-30' }).success).toBe(false);
    expect(
      operationSchema.safeParse({
        ...op,
        kind: 'transfer',
        transferGroupId: null,
        categoryId: null,
      }).success,
    ).toBe(false);
    expect(
      operationSchema.safeParse({ ...op, kind: 'transfer', transferGroupId: acc.id }).success,
    ).toBe(false);
    expect(exportDataSchema.safeParse(exportData()).success).toBe(true);
  });
});

describe('defaults', () => {
  it('creates the spreadsheet categories plus Abonnements, Santé and Épargne', () => {
    const cats = createDefaultCategories('fr-FR', '2026-10-23T00:00:00.000Z');
    expect(cats.map((c) => c.name)).toEqual([
      'Logement',
      'Transport',
      'Alimentation',
      'Loisirs',
      'Abonnements',
      'Santé',
      'Épargne',
      'Revenu',
    ]);
    expect(cats.filter((c) => c.kind === 'income').map((c) => c.name)).toEqual(['Revenu']);
    expect(createDefaultCategories('en-GB', '')[0]?.name).toBe('Housing');
    expect(createDefaultCategories('xx', '')[0]?.name).toBe('Logement');
    expect(createDefaultSettings('2026-10-23T00:00:00.000Z')).toMatchObject({
      currency: 'EUR',
      budgetMonthStartDay: 1,
      backupReminderDays: 30,
    });
    expect(createMeta('1.0.0', 'x').schemaVersion).toBe(SCHEMA_VERSION);
    expect(paletteColor(-1)).toBe(paletteColor(7));
    expect(darkVariant('#2A78D6')).toBe('#3987e5');
    expect(darkVariant('#123456')).toBe('#123456');
    expect(category().color).toMatch(/^#/);
  });
});

describe('migrations', () => {
  const v1 = { operations: [{ amount: 1 }] };
  const migrations = [
    {
      from: 1,
      to: 2,
      description: 'rename amount',
      migrate: (d: Record<string, unknown>) => ({ ...d, renamed: true }),
    },
    {
      from: 2,
      to: 3,
      description: 'fails',
      migrate: () => {
        throw new Error('boom');
      },
    },
  ];

  it('applies sequential steps on a copy and is idempotent per version', () => {
    const out = migrateData(v1, 1, 2, migrations);
    expect(out).toEqual({ data: { operations: [{ amount: 1 }], renamed: true }, applied: [2] });
    expect(v1).toEqual({ operations: [{ amount: 1 }] });
    expect(migrateData(out.data, 2, 2, migrations).applied).toEqual([]);
    expect(migrateData(v1, SCHEMA_VERSION).applied).toEqual([]);
  });

  it('refuses newer data, missing steps and failed steps', () => {
    expect(() => migrateData(v1, 5, 2, migrations)).toThrow(MigrationError);
    expect(() => migrateData(v1, 0, 2, migrations)).toThrow(/tooOld/);
    expect(() => migrateData(v1, 1, 4, migrations)).toThrow(/failed/);
    expect(() => migrateData(v1, 1, 2, [])).toThrow(/missingStep/);
  });
});
