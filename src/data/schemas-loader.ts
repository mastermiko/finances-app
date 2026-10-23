/**
 * Zod schemas are loaded on demand: reading data never needs them, so they stay
 * out of the initial bundle and arrive with the first write (or are prefetched
 * when the browser is idle, see src/app/Layout.tsx).
 *
 * Always await `loadSchemas()` before opening a Dexie transaction: awaiting a
 * pending dynamic import inside a transaction would let IndexedDB auto-commit it.
 */
import type * as SchemaModule from '@/domain/model/schemas';

type Schemas = typeof SchemaModule;

let pending: Promise<Schemas> | null = null;

export function loadSchemas(): Promise<Schemas> {
  pending ??= import('@/domain/model/schemas');
  return pending;
}

/** Starts loading the schemas in the background (idle prefetch before a first write). */
export function preloadSchemas(): void {
  void loadSchemas().catch(() => undefined);
}
