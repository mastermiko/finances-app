import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/domain/model';
import {
  account as accountFactory,
  category as categoryFactory,
  operation as operationFactory,
} from '@/test/factories';
import {
  AccountError,
  BootstrapError,
  CategoryError,
  FinancesDb,
  addOperation,
  addTransfer,
  applyRulesToOperations,
  backupText,
  bulkUpdateOperations,
  categoryUsage,
  clearAllData,
  clearErrorLog,
  commitImport,
  commitSnapshot,
  confirmPlanned,
  copyPreviousBudgets,
  countOperations,
  createAccount,
  createBackup,
  createCategory,
  createTag,
  deleteAccount,
  deleteBackup,
  deleteBackupDatabase,
  deleteBudget,
  deleteCategory,
  deleteGoal,
  deleteRecurrence,
  deleteRule,
  deleteTag,
  detectLocale,
  duePlanned,
  duplicateOperations,
  emptyTrash,
  getDb,
  getMeta,
  getOperation,
  initialize,
  isStorageCritical,
  kvDelete,
  kvGet,
  kvSet,
  listBackups,
  listTrash,
  logError,
  markBackupDone,
  MAX_BACKUPS,
  operationsInPeriods,
  allLiveOperations,
  purgeTrash,
  putOperations,
  queries,
  readErrorLog,
  readSnapshot,
  reorderCategories,
  replaceWithSnapshot,
  requireSettings,
  restoreBackup,
  restoreOperations,
  runRecurrences,
  saveGoal,
  saveRecurrence,
  saveRule,
  scrub,
  setBudget,
  setClock,
  setDb,
  softDeleteOperations,
  storageStatus,
  undoImport,
  UndoImportError,
  updateAccount,
  updateCategory,
  updateOperation,
  updateSettings,
  updateTag,
} from './index';

let counter = 0;

beforeEach(async () => {
  counter += 1;
  setDb(new FinancesDb(`test-${counter}`));
  setClock(() => new Date('2026-10-23T10:00:00.000Z'));
  await initialize('1.0.0', 'fr-FR', 'Compte courant');
});

afterEach(async () => {
  getDb().close();
  setDb(null);
  setClock(null);
  await deleteBackupDatabase();
});

async function firstCategory(name: string) {
  const cat = (await getDb().categories.toArray()).find((c) => c.name === name);
  if (!cat) throw new Error(name);
  return cat;
}

async function defaultAccountId(): Promise<string> {
  return (await requireSettings()).defaultAccountId ?? '';
}

describe('bootstrap', () => {
  it('creates settings, a default account and the default categories once', async () => {
    const settings = await requireSettings();
    expect(settings).toMatchObject({ locale: 'fr-FR', currency: 'EUR' });
    expect(await getDb().accounts.count()).toBe(1);
    expect(await getDb().categories.count()).toBe(8);
    const again = await initialize('1.0.1', 'fr-FR', 'X');
    expect(again.firstLaunch).toBe(false);
    expect(await getDb().categories.count()).toBe(8);
    expect((await getMeta())?.appVersion).toBe('1.0.1');
  });

  it('refuses data written by a newer schema', async () => {
    await getDb().meta.put({
      id: 'meta',
      schemaVersion: SCHEMA_VERSION + 1,
      appVersion: '9',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(initialize('1.0.0', 'fr-FR', 'X')).rejects.toBeInstanceOf(BootstrapError);
  });

  it('detects the locale', () => {
    expect(detectLocale(['fr-CA'])).toBe('fr-FR');
    expect(detectLocale(['en-US'])).toBe('en-GB');
    expect(detectLocale([])).toBe('fr-FR');
  });
});

describe('operations repository', () => {
  it('adds, updates (period follows the date) and keeps transfer legs consistent', async () => {
    const accountId = await defaultAccountId();
    const food = await firstCategory('Alimentation');
    const op = await addOperation({
      accountId,
      date: '2026-10-10',
      amountMinor: -250,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: ' Café ',
    });
    expect(op).toMatchObject({ period: '2026-10', label: 'Café' });
    const moved = await updateOperation(op.id, { date: '2026-09-30', note: ' note ' });
    expect(moved).toMatchObject({ period: '2026-09', note: 'note' });
    const undated = await updateOperation(op.id, { date: null, period: '2026-08' });
    expect(undated.period).toBe('2026-08');
    await expect(updateOperation('missing', {})).rejects.toThrow();

    const savings = await createAccount({
      name: 'Livret A',
      type: 'savings',
      currency: 'EUR',
      openingBalanceMinor: 0,
      openingDate: null,
    });
    const [out, inn] = await addTransfer({
      fromAccountId: accountId,
      toAccountId: savings.id,
      amountMinor: 5000,
      currency: 'EUR',
      date: '2026-10-01',
      label: 'Épargne',
    });
    await updateOperation(out.id, { amountMinor: -7000, label: 'Épargne mensuelle' });
    const other = await getOperation(inn.id);
    expect(other).toMatchObject({ amountMinor: 7000, label: 'Épargne mensuelle' });
  });

  it('deletes one line among identical ones, restores, and purges the trash after 30 days', async () => {
    const accountId = await defaultAccountId();
    const food = await firstCategory('Alimentation');
    const draft = {
      accountId,
      date: '2026-10-10',
      amountMinor: -250,
      currency: 'EUR',
      kind: 'expense' as const,
      categoryId: food.id,
      label: 'Café',
    };
    const a = await addOperation(draft);
    await addOperation(draft);
    expect(await softDeleteOperations([a.id])).toEqual([a.id]);
    expect(await allLiveOperations()).toHaveLength(1);
    expect(await listTrash()).toHaveLength(1);
    await restoreOperations([a.id]);
    expect(await allLiveOperations()).toHaveLength(2);
    await softDeleteOperations([a.id]);
    expect(await purgeTrash()).toBe(0);
    setClock(() => new Date('2026-12-01T10:00:00.000Z'));
    expect(await purgeTrash()).toBe(1);
    await softDeleteOperations((await allLiveOperations()).map((o) => o.id));
    expect(await emptyTrash()).toBe(1);
    expect(await countOperations()).toBe(0);
  });

  it('deletes both legs of a transfer and duplicates them together', async () => {
    const accountId = await defaultAccountId();
    const izly = await createAccount({
      name: 'Izly',
      type: 'prepaid',
      currency: 'EUR',
      openingBalanceMinor: 0,
      openingDate: null,
    });
    const [out] = await addTransfer({
      fromAccountId: accountId,
      toAccountId: izly.id,
      amountMinor: 2000,
      currency: 'EUR',
      date: '2026-10-01',
      label: 'Recharge',
    });
    const copies = await duplicateOperations([out.id]);
    expect(copies).toHaveLength(2);
    expect(copies[0]?.transferGroupId).toBe(copies[1]?.transferGroupId);
    expect(copies[0]?.transferGroupId).not.toBe(out.transferGroupId);
    expect(await softDeleteOperations([out.id])).toHaveLength(2);
  });

  it('bulk updates with undo data, confirms planned and lists due ones', async () => {
    const accountId = await defaultAccountId();
    const food = await firstCategory('Alimentation');
    const leisure = await firstCategory('Loisirs');
    const op = await addOperation({
      accountId,
      date: '2026-10-01',
      amountMinor: -100,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: 'A',
      status: 'planned',
    });
    const undatedPlanned = await addOperation({
      accountId,
      date: null,
      period: '2026-10',
      amountMinor: -100,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: 'B',
      status: 'planned',
    });
    expect((await duePlanned('2026-10')).map((o) => o.id).sort()).toEqual(
      [op.id, undatedPlanned.id].sort(),
    );
    const tag = await createTag('café', '#2a78d6');
    const before = await bulkUpdateOperations([op.id], {
      categoryId: leisure.id,
      addTagIds: [tag.id],
    });
    expect(await getOperation(op.id)).toMatchObject({ categoryId: leisure.id, tagIds: [tag.id] });
    await putOperations(before);
    expect(await getOperation(op.id)).toMatchObject({ categoryId: food.id, tagIds: [] });
    await bulkUpdateOperations([op.id], { removeTagIds: [tag.id], accountId });
    await confirmPlanned([op.id]);
    expect((await getOperation(op.id))?.status).toBe('cleared');
    expect(await operationsInPeriods('2026-10', '2026-10')).toHaveLength(2);
  });
});

describe('reference entities', () => {
  it('manages categories: cycles, kind changes, reorder, deletion with reassignment', async () => {
    const food = await firstCategory('Alimentation');
    const leisure = await firstCategory('Loisirs');
    const coffee = await createCategory({
      name: 'Café',
      kind: 'expense',
      parentId: food.id,
      color: '#2a78d6',
      icon: 'coffee',
    });
    await expect(updateCategory(food.id, { parentId: coffee.id })).rejects.toEqual(
      new CategoryError('cycle'),
    );
    await expect(updateCategory('nope', {})).rejects.toEqual(new CategoryError('notFound'));
    const accountId = await defaultAccountId();
    const op = await addOperation({
      accountId,
      date: '2026-10-01',
      amountMinor: -100,
      currency: 'EUR',
      kind: 'expense',
      categoryId: coffee.id,
      label: 'Café',
    });
    await expect(updateCategory(coffee.id, { kind: 'income' })).rejects.toEqual(
      new CategoryError('kindMismatch'),
    );
    expect((await updateCategory(coffee.id, { name: 'Cafés' })).name).toBe('Cafés');
    await saveRule({
      name: 'r',
      matchType: 'contains',
      pattern: 'café',
      actions: { categoryId: coffee.id, label: null, addTagIds: [] },
      enabled: true,
    });
    expect(await categoryUsage(coffee.id)).toEqual({
      operations: 1,
      budgets: 0,
      rules: 1,
      children: 0,
    });
    await expect(deleteCategory(coffee.id, null)).rejects.toEqual(
      new CategoryError('needsReassignment'),
    );
    await expect(deleteCategory(coffee.id, coffee.id)).rejects.toEqual(
      new CategoryError('sameCategory'),
    );
    const income = await firstCategory('Revenu');
    await expect(deleteCategory(coffee.id, income.id)).rejects.toEqual(
      new CategoryError('kindMismatch'),
    );
    await setBudget('2026-10', coffee.id, 1000, false);
    await deleteCategory(coffee.id, leisure.id);
    expect((await getOperation(op.id))?.categoryId).toBe(leisure.id);
    expect(await getDb().budgets.count()).toBe(0);
    const ids = (await getDb().categories.orderBy('order').toArray()).map((c) => c.id).reverse();
    await reorderCategories(ids);
    expect((await getDb().categories.orderBy('order').first())?.id).toBe(ids[0]);
    const parent = await createCategory({
      name: 'P',
      kind: 'expense',
      parentId: null,
      color: '#2a78d6',
      icon: 'tag',
    });
    const child = await createCategory({
      name: 'C',
      kind: 'expense',
      parentId: parent.id,
      color: '#2a78d6',
      icon: 'tag',
    });
    await deleteCategory(parent.id, null);
    expect((await getDb().categories.get(child.id))?.parentId).toBeNull();
  });

  it('manages accounts and protects the last one / used ones', async () => {
    const accountId = await defaultAccountId();
    await expect(deleteAccount(accountId)).rejects.toEqual(new AccountError('lastAccount'));
    const second = await createAccount({
      name: 'Espèces',
      type: 'cash',
      currency: 'EUR',
      openingBalanceMinor: 1000,
      openingDate: '2026-01-01',
    });
    await updateSettings({ defaultAccountId: second.id });
    expect((await updateAccount(second.id, { name: 'Liquide' })).name).toBe('Liquide');
    await expect(updateAccount('nope', {})).rejects.toThrow();
    const food = await firstCategory('Alimentation');
    await addOperation({
      accountId,
      date: '2026-10-01',
      amountMinor: -1,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: '',
    });
    await expect(deleteAccount(accountId)).rejects.toEqual(new AccountError('inUse'));
    await deleteAccount(second.id);
    expect((await requireSettings()).defaultAccountId).toBe(accountId);
  });

  it('sets, copies and deletes budgets', async () => {
    const food = await firstCategory('Alimentation');
    await setBudget('2026-09', null, 50000, true);
    await setBudget('2026-09', food.id, 20000, false);
    await setBudget('2026-09', food.id, 25000, false);
    expect(await getDb().budgets.count()).toBe(2);
    expect(await copyPreviousBudgets('2026-10')).toBe(2);
    expect(await copyPreviousBudgets('2020-01')).toBe(0);
    await deleteBudget('2026-10', food.id);
    expect(await getDb().budgets.where('period').equals('2026-10').count()).toBe(1);
  });

  it('cascades tag deletion and applies rules retroactively', async () => {
    const accountId = await defaultAccountId();
    const food = await firstCategory('Alimentation');
    const tag = await createTag('café', '#2a78d6');
    expect((await updateTag(tag.id, { name: 'Café' })).name).toBe('Café');
    await expect(updateTag('nope', {})).rejects.toThrow();
    const op = await addOperation({
      accountId,
      date: '2026-10-01',
      amountMinor: -250,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: 'cafe crème',
    });
    const rule = await saveRule({
      name: 'Café',
      matchType: 'contains',
      pattern: 'café',
      actions: { categoryId: null, label: 'Café', addTagIds: [tag.id] },
      enabled: true,
    });
    const before = await applyRulesToOperations([rule.id], [op.id]);
    expect(before).toHaveLength(1);
    expect(await getOperation(op.id)).toMatchObject({ label: 'Café', tagIds: [tag.id] });
    expect(await applyRulesToOperations([rule.id], [op.id])).toHaveLength(0);
    const updated = await saveRule({ ...rule, name: 'Café 2' });
    expect(updated.createdAt).toBe(rule.createdAt);
    await deleteTag(tag.id);
    expect((await getOperation(op.id))?.tagIds).toEqual([]);
    expect((await getDb().rules.get(rule.id))?.actions.addTagIds).toEqual([]);
    await deleteRule(rule.id);
    expect(await getDb().rules.count()).toBe(0);
  });

  it('generates recurring operations idempotently and regenerates on rule change', async () => {
    const accountId = await defaultAccountId();
    const housing = await firstCategory('Logement');
    const rec = await saveRecurrence({
      name: 'Loyer',
      template: {
        accountId,
        toAccountId: null,
        amountMinor: -55000,
        currency: 'EUR',
        kind: 'expense',
        categoryId: housing.id,
        label: 'Loyer',
        note: '',
        tagIds: [],
      },
      rule: 'FREQ=MONTHLY;INTERVAL=1',
      dtstart: '2026-10-05',
      undated: true,
      autoConfirm: true,
      active: true,
    });
    expect(await runRecurrences()).toBe(2); // October (confirmed) and November (planned)
    expect(await runRecurrences()).toBe(0);
    const ops = await getDb().operations.where('recurrenceId').equals(rec.id).sortBy('period');
    expect(ops.map((o) => [o.period, o.date, o.status])).toEqual([
      ['2026-10', null, 'cleared'],
      ['2026-11', null, 'planned'],
    ]);
    await saveRecurrence({ ...rec, rule: 'FREQ=MONTHLY;INTERVAL=2' });
    expect(await getDb().operations.where('recurrenceId').equals(rec.id).count()).toBe(1);
    await expect(saveRecurrence({ ...rec, rule: 'bad' })).rejects.toThrow();
    await deleteRecurrence(rec.id, true);
    expect(await getDb().recurrences.count()).toBe(0);
  });

  it('saves goals and key-values', async () => {
    const goal = await saveGoal({
      name: 'Ski',
      targetMinor: 50000,
      dueDate: null,
      accountId: null,
    });
    expect((await saveGoal({ ...goal, name: 'Ski 2027' })).name).toBe('Ski 2027');
    await deleteGoal(goal.id);
    await kvSet('k', { a: 1 });
    expect(await kvGet('k')).toEqual({ a: 1 });
    await kvDelete('k');
    expect(await kvGet('k')).toBeUndefined();
    expect(await queries.kv('k')).toBeUndefined();
  });
});

describe('snapshots, imports and backups', () => {
  it('commits a workbook import in one transaction and undoes it (merge)', async () => {
    const accountId = await defaultAccountId();
    const cat = categoryFactory({ name: 'Nouvelle' });
    const op = operationFactory({ accountId, categoryId: cat.id });
    const { batch } = await commitImport(
      {
        source: 'xlsm',
        fileName: 'Finances.xlsm',
        fileHash: 'a'.repeat(64),
        mode: 'merge',
        categories: [cat],
        accounts: [],
        tags: [],
        rules: [],
        operations: [op],
        openingBalance: { accountId, amountMinor: 1234 },
      },
      '1.0.0',
    );
    expect((await getOperation(op.id))?.importBatchId).toBe(batch.id);
    expect((await getDb().accounts.get(accountId))?.openingBalanceMinor).toBe(1234);
    await undoImport(batch.id, '1.0.0');
    expect(await getOperation(op.id)).toBeUndefined();
    expect(await getDb().categories.get(cat.id)).toBeUndefined();
    await expect(undoImport(batch.id, '1.0.0')).rejects.toEqual(
      new UndoImportError('alreadyUndone'),
    );
    await expect(undoImport('nope', '1.0.0')).rejects.toEqual(new UndoImportError('notFound'));
  });

  it('replace mode is undone by restoring the automatic backup', async () => {
    const accountId = await defaultAccountId();
    const food = await firstCategory('Alimentation');
    const kept = await addOperation({
      accountId,
      date: '2026-10-01',
      amountMinor: -1,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: 'avant',
    });
    const imported = operationFactory({ accountId, categoryId: food.id });
    const { batch } = await commitImport(
      {
        source: 'csv',
        fileName: 'r.csv',
        fileHash: 'b'.repeat(64),
        mode: 'replace',
        categories: [],
        accounts: [accountFactory()],
        tags: [],
        rules: [],
        operations: [imported],
      },
      '1.0.0',
    );
    expect(await getOperation(kept.id)).toBeUndefined();
    await undoImport(batch.id, '1.0.0');
    expect(await getOperation(kept.id)).toBeDefined();
    expect(await getOperation(imported.id)).toBeUndefined();
  });

  it('restores JSON snapshots identically and can roll back', async () => {
    const snapshot = await readSnapshot();
    const accountId = await defaultAccountId();
    const food = await firstCategory('Alimentation');
    await addOperation({
      accountId,
      date: '2026-10-01',
      amountMinor: -1,
      currency: 'EUR',
      kind: 'expense',
      categoryId: food.id,
      label: 'x',
    });
    const outcome = await commitSnapshot(
      snapshot,
      { fileName: 'b.json', fileHash: 'c'.repeat(64), mode: 'replace' },
      '1.0.0',
    );
    expect(await readSnapshot()).toEqual(snapshot);
    await restoreBackup(outcome.backupId, '1.0.0');
    expect(await countOperations()).toBe(1);
    await expect(restoreBackup('nope', '1.0.0')).rejects.toBeInstanceOf(UndoImportError);
    await replaceWithSnapshot(snapshot);
    expect(await countOperations()).toBe(0);
  });

  it('keeps the last backups only, readable as export files', async () => {
    for (let i = 0; i < MAX_BACKUPS + 2; i += 1) {
      setClock(() => new Date(Date.UTC(2026, 9, 23, 10, i)));
      await createBackup('manual', '1.0.0');
    }
    const list = await listBackups();
    expect(list).toHaveLength(MAX_BACKUPS);
    const text = await backupText(list[0]?.id ?? '');
    expect(text).toContain('"format":"finances-app"');
    await deleteBackup(list[0]?.id ?? '');
    expect(await listBackups()).toHaveLength(MAX_BACKUPS - 1);
    expect(await backupText('nope')).toBeNull();
  });

  it('clears everything and records backups in the settings', async () => {
    await markBackupDone();
    expect((await requireSettings()).lastBackupAt).toBe('2026-10-23T10:00:00.000Z');
    await clearAllData();
    expect(await getDb().settings.count()).toBe(0);
  });
});

describe('error log and storage', () => {
  it('logs errors without amounts and caps the journal', async () => {
    expect(scrub('Montant 1 234,56 refusé')).toBe('Montant # refusé');
    await logError(new Error('Échec 12,50 €'), '#/operations?q=café', '1.0.0');
    await logError('texte', '#/', '1.0.0');
    const log = await readErrorLog();
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ message: 'Error: Échec # €', route: '#/operations' });
    await clearErrorLog();
    expect(await readErrorLog()).toEqual([]);
  });

  it('reports storage status', async () => {
    const status = await storageStatus();
    expect(status).toHaveProperty('ratio');
    expect(isStorageCritical({ persisted: true, usage: 90, quota: 100, ratio: 0.9 })).toBe(true);
    expect(isStorageCritical({ persisted: true, usage: null, quota: null, ratio: null })).toBe(
      false,
    );
  });
});
