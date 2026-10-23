/**
 * User actions with undo: every destructive or bulk change offers "Annuler"
 * for 10 seconds; deleted operations stay in the trash for 30 days.
 */
import {
  bulkUpdateOperations,
  confirmPlanned,
  duplicateOperations,
  logError,
  putOperations,
  restoreOperations,
  softDeleteOperations,
} from '@/data';
import type { Translate } from '@/i18n';
import { toast } from '@/ui';

export async function deleteWithUndo(ids: readonly string[], t: Translate): Promise<void> {
  try {
    const deleted = await softDeleteOperations(ids);
    toast(t('toast.deleted', { count: deleted.length }), {
      tone: 'success',
      action: {
        label: t('common.undo'),
        onAction: async () => {
          await restoreOperations(deleted);
          toast(t('toast.restored', { count: deleted.length }), { tone: 'success' });
        },
      },
    });
  } catch (error) {
    reportError(error, t);
  }
}

export async function duplicateWithUndo(ids: readonly string[], t: Translate): Promise<void> {
  try {
    const copies = await duplicateOperations(ids);
    toast(t('toast.duplicated', { count: copies.length }), {
      tone: 'success',
      action: {
        label: t('common.undo'),
        onAction: async () => {
          await softDeleteOperations(copies.map((c) => c.id));
        },
      },
    });
  } catch (error) {
    reportError(error, t);
  }
}

export async function bulkUpdateWithUndo(
  ids: readonly string[],
  patch: Parameters<typeof bulkUpdateOperations>[1],
  message: string,
  t: Translate,
): Promise<void> {
  try {
    const previous = await bulkUpdateOperations(ids, patch);
    toast(message, {
      tone: 'success',
      action: { label: t('common.undo'), onAction: () => putOperations(previous) },
    });
  } catch (error) {
    reportError(error, t);
  }
}

export async function confirmWithToast(ids: readonly string[], t: Translate): Promise<void> {
  try {
    await confirmPlanned(ids);
    toast(t('toast.confirmed', { count: ids.length }), { tone: 'success' });
  } catch (error) {
    reportError(error, t);
  }
}

export function reportError(error: unknown, t: Translate): void {
  void logError(error, location.hash, __APP_VERSION__);
  toast(t('error.actionFailed'), { tone: 'error' });
}
