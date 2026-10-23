/**
 * Sequential, idempotent data migrations vN → vN+1, applied to a whole data
 * snapshot (export file or local database dump). Each migration is a pure
 * function tested on a frozen data set of its source version.
 *
 * v1 is the first public schema, so the registry is empty for now. To change the
 * structure: bump SCHEMA_VERSION, add { from: 1, to: 2, migrate } here, add a
 * frozen v1 fixture under src/test/fixtures/migrations and a test.
 */
import { SCHEMA_VERSION } from './constants';

export type RawData = Record<string, unknown>;

export interface Migration {
  readonly from: number;
  readonly to: number;
  readonly description: string;
  readonly migrate: (data: RawData) => RawData;
}

export const MIGRATIONS: readonly Migration[] = [];

export class MigrationError extends Error {
  constructor(
    readonly code: 'tooNew' | 'tooOld' | 'missingStep' | 'failed',
    readonly fromVersion: number,
    readonly targetVersion: number,
    options?: { cause?: unknown },
  ) {
    super(`Migration ${code}: ${fromVersion} → ${targetVersion}`, options);
  }
}

export interface MigrationOutcome {
  readonly data: RawData;
  readonly applied: readonly number[];
}

export function migrateData(
  data: RawData,
  fromVersion: number,
  targetVersion: number = SCHEMA_VERSION,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationOutcome {
  if (fromVersion > targetVersion) throw new MigrationError('tooNew', fromVersion, targetVersion);
  if (fromVersion < 1) throw new MigrationError('tooOld', fromVersion, targetVersion);
  let current: RawData = structuredClone(data);
  const applied: number[] = [];
  for (let v = fromVersion; v < targetVersion; v += 1) {
    const step = migrations.find((m) => m.from === v && m.to === v + 1);
    if (!step) throw new MigrationError('missingStep', v, v + 1);
    try {
      current = step.migrate(current);
    } catch (cause) {
      throw new MigrationError('failed', v, v + 1, { cause });
    }
    applied.push(step.to);
  }
  return { data: current, applied };
}
