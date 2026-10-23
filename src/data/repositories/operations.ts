/**
 * Operations repository. Every write goes through the Zod schema; timestamps
 * are set here, never by the UI. Deletion is logical (trash, purged after 30 days).
 */
import { addDays } from '@/domain/common/civil-date';
import { uuidv7 } from '@/domain/common/uuid';
import { cleanLabel } from '@/domain/common/text';
import { type Operation } from '@/domain/model';
import {
  buildOperation,
  buildTransfer,
  duplicateOperation,
  resolvePeriod,
  type OperationDraft,
  type TransferDraft,
} from '@/domain/operations/operations';
import { loadSchemas } from '../schemas-loader';
import { nowIso, today } from '../clock';
import { getDb } from '../db';
import { requireSettings } from './settings';

export const TRASH_RETENTION_DAYS = 30;

export async function getOperation(id: string): Promise<Operation | undefined> {
  return getDb().operations.get(id);
}

export async function addOperation(draft: OperationDraft): Promise<Operation> {
  const { operationSchema } = await loadSchemas();
  const settings = await requireSettings();
  const op = operationSchema.parse(buildOperation(draft, settings.budgetMonthStartDay, nowIso()));
  await getDb().operations.add(op);
  return op;
}

export async function addTransfer(draft: TransferDraft): Promise<[Operation, Operation]> {
  const { operationSchema } = await loadSchemas();
  const settings = await requireSettings();
  const [out, inn] = buildTransfer(draft, settings.budgetMonthStartDay, nowIso());
  const pair: [Operation, Operation] = [operationSchema.parse(out), operationSchema.parse(inn)];
  await getDb().operations.bulkAdd(pair);
  return pair;
}

export type OperationPatch = Partial<
  Pick<
    Operation,
    | 'accountId'
    | 'date'
    | 'period'
    | 'amountMinor'
    | 'kind'
    | 'categoryId'
    | 'label'
    | 'amountExpression'
    | 'note'
    | 'tagIds'
    | 'status'
  >
> & {
  /** For transfers: the account of the other leg. */
  readonly counterpartAccountId?: string;
};

/**
 * Updates an operation. When the date changes and no explicit period is given,
 * the period is derived again from the date. Transfer legs stay consistent.
 */
export async function updateOperation(id: string, patch: OperationPatch): Promise<Operation> {
  const { operationSchema } = await loadSchemas();
  const db = getDb();
  const settings = await requireSettings();
  return db.transaction('rw', db.operations, async () => {
    const current = await db.operations.get(id);
    if (!current) throw new Error(`Operation ${id} not found`);
    const stamp = nowIso();
    const date = patch.date !== undefined ? patch.date : current.date;
    const dateChanged = patch.date !== undefined && patch.date !== current.date;
    const period =
      patch.period !== undefined
        ? resolvePeriod(date, patch.period, settings.budgetMonthStartDay)
        : dateChanged
          ? resolvePeriod(date, null, settings.budgetMonthStartDay)
          : current.period;
    const { counterpartAccountId, ...fields } = patch;
    const next: Operation = operationSchema.parse({
      ...current,
      ...fields,
      date,
      period,
      label: patch.label !== undefined ? cleanLabel(patch.label) : current.label,
      note: patch.note !== undefined ? patch.note.trim() : current.note,
      categoryId:
        (patch.kind ?? current.kind) === 'transfer'
          ? null
          : (patch.categoryId ?? current.categoryId),
      updatedAt: stamp,
    });
    await db.operations.put(next);
    if (current.transferGroupId) {
      const legs = await db.operations
        .where('transferGroupId')
        .equals(current.transferGroupId)
        .toArray();
      for (const leg of legs) {
        if (leg.id === id) continue;
        await db.operations.put(
          operationSchema.parse({
            ...leg,
            date: next.date,
            period: next.period,
            label: next.label,
            note: next.note,
            tagIds: next.tagIds,
            status: next.status,
            amountMinor: -next.amountMinor,
            accountId: counterpartAccountId ?? leg.accountId,
            updatedAt: stamp,
          }),
        );
      }
    }
    return next;
  });
}

/** Ids of the given operations plus the other legs of their transfers. */
async function withTransferLegs(ids: readonly string[]): Promise<string[]> {
  const db = getDb();
  const ops = await db.operations.bulkGet([...ids]);
  const groups = new Set(ops.map((o) => o?.transferGroupId).filter((g): g is string => Boolean(g)));
  const all = new Set(ids);
  if (groups.size > 0) {
    const legs = await db.operations
      .where('transferGroupId')
      .anyOf([...groups])
      .toArray();
    for (const leg of legs) all.add(leg.id);
  }
  return [...all];
}

/** Moves operations to the trash. Returns the ids actually deleted (for undo). */
export async function softDeleteOperations(ids: readonly string[]): Promise<string[]> {
  const db = getDb();
  return db.transaction('rw', db.operations, async () => {
    const all = await withTransferLegs(ids);
    const stamp = nowIso();
    const ops = (await db.operations.bulkGet(all)).filter(
      (o): o is Operation => o !== undefined && o.deletedAt === null,
    );
    await db.operations.bulkPut(ops.map((o) => ({ ...o, deletedAt: stamp, updatedAt: stamp })));
    return ops.map((o) => o.id);
  });
}

export async function restoreOperations(ids: readonly string[]): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.operations, async () => {
    const stamp = nowIso();
    const ops = (await db.operations.bulkGet([...ids])).filter(
      (o): o is Operation => o !== undefined,
    );
    await db.operations.bulkPut(ops.map((o) => ({ ...o, deletedAt: null, updatedAt: stamp })));
  });
}

/** Permanently removes trashed operations older than the retention period. */
export async function purgeTrash(retentionDays = TRASH_RETENTION_DAYS): Promise<number> {
  const db = getDb();
  const limit = new Date(Date.parse(nowIso()) - retentionDays * 86_400_000).toISOString();
  return db.operations.where('deletedAt').below(limit).delete();
}

export async function emptyTrash(): Promise<number> {
  return getDb().operations.where('deletedAt').above('').delete();
}

export async function listTrash(): Promise<Operation[]> {
  const ops = await getDb().operations.where('deletedAt').above('').toArray();
  return ops.sort((a, b) => ((a.deletedAt ?? '') < (b.deletedAt ?? '') ? 1 : -1));
}

export async function duplicateOperations(ids: readonly string[]): Promise<Operation[]> {
  const { operationSchema } = await loadSchemas();
  const db = getDb();
  const stamp = nowIso();
  const ops = (await db.operations.bulkGet([...ids])).filter(
    (o): o is Operation => o !== undefined,
  );
  const copies: Operation[] = [];
  const groupMap = new Map<string, string>();
  for (const op of ops) {
    const copy = duplicateOperation(op, stamp);
    if (op.transferGroupId) {
      let group = groupMap.get(op.transferGroupId);
      if (!group) {
        group = uuidv7();
        groupMap.set(op.transferGroupId, group);
        // duplicate the other leg too
        const legs = await db.operations
          .where('transferGroupId')
          .equals(op.transferGroupId)
          .toArray();
        for (const leg of legs) {
          if (leg.id === op.id || ids.includes(leg.id)) continue;
          copies.push(
            operationSchema.parse({ ...duplicateOperation(leg, stamp), transferGroupId: group }),
          );
        }
      }
      copies.push(operationSchema.parse({ ...copy, transferGroupId: group }));
    } else {
      copies.push(operationSchema.parse(copy));
    }
  }
  await db.operations.bulkAdd(copies);
  return copies;
}

export interface BulkPatch {
  readonly categoryId?: string;
  readonly addTagIds?: readonly string[];
  readonly removeTagIds?: readonly string[];
  readonly status?: Operation['status'];
  readonly accountId?: string;
}

/** Bulk update. Returns the previous versions for undo. */
export async function bulkUpdateOperations(
  ids: readonly string[],
  patch: BulkPatch,
): Promise<Operation[]> {
  const { operationSchema } = await loadSchemas();
  const db = getDb();
  return db.transaction('rw', db.operations, async () => {
    const stamp = nowIso();
    const ops = (await db.operations.bulkGet([...ids])).filter(
      (o): o is Operation => o !== undefined,
    );
    const updated = ops.map((op) => {
      const tags = new Set(op.tagIds);
      for (const t of patch.addTagIds ?? []) tags.add(t);
      for (const t of patch.removeTagIds ?? []) tags.delete(t);
      return operationSchema.parse({
        ...op,
        categoryId:
          patch.categoryId !== undefined && op.kind !== 'transfer'
            ? patch.categoryId
            : op.categoryId,
        tagIds: [...tags],
        status: patch.status ?? op.status,
        accountId: patch.accountId ?? op.accountId,
        updatedAt: stamp,
      });
    });
    await db.operations.bulkPut(updated);
    return ops;
  });
}

/** Restores previous versions (undo of a bulk update or an edit). */
export async function putOperations(ops: readonly Operation[]): Promise<void> {
  const { operationSchema } = await loadSchemas();
  await getDb().operations.bulkPut(ops.map((o) => operationSchema.parse(o)));
}

export async function confirmPlanned(ids: readonly string[]): Promise<void> {
  await bulkUpdateOperations(await withTransferLegs(ids), { status: 'cleared' });
}

export async function countOperations(): Promise<number> {
  return getDb().operations.count();
}

/** All live operations (used by analytics; 50 000 rows load in a few hundred ms). */
export async function allLiveOperations(): Promise<Operation[]> {
  return getDb()
    .operations.filter((o) => o.deletedAt === null)
    .toArray();
}

export async function operationsInPeriods(from: string, to: string): Promise<Operation[]> {
  return getDb()
    .operations.where('period')
    .between(from, to, true, true)
    .filter((o) => o.deletedAt === null)
    .toArray();
}

/** Planned operations whose date (or period, when undated) is reached. */
export async function duePlanned(currentPeriod: string): Promise<Operation[]> {
  const limit = addDays(today(), 0);
  return getDb()
    .operations.filter(
      (o) =>
        o.deletedAt === null &&
        o.status === 'planned' &&
        (o.date === null ? o.period <= currentPeriod : o.date <= limit),
    )
    .toArray();
}
