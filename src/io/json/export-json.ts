/**
 * Reference format: versioned JSON export (.finances.json).
 * Arrays are sorted by id and keys are emitted in canonical order, so exporting,
 * re-importing into an empty browser and exporting again yields identical `data`.
 */
import {
  EXPORT_FORMAT,
  SCHEMA_VERSION,
  migrateData,
  MigrationError,
  type ExportData,
  type ExportEnvelope,
} from '@/domain/model';
import { exportDataSchema, exportEnvelopeHeaderSchema } from '@/domain/model/schemas';
import { canonicalJson, sha256Hex } from '../checksum';

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function normalizeExportData(data: ExportData): ExportData {
  return {
    accounts: [...data.accounts].sort(byId),
    categories: [...data.categories].sort(byId),
    operations: [...data.operations].sort(byId),
    budgets: [...data.budgets].sort(byId),
    recurrences: [...data.recurrences].sort(byId),
    rules: [...data.rules].sort(byId),
    tags: [...data.tags].sort(byId),
    goals: [...data.goals].sort(byId),
    importBatches: [...data.importBatches].sort(byId),
    settings: data.settings,
  };
}

export async function checksumOf(data: ExportData): Promise<string> {
  return `sha256-${await sha256Hex(canonicalJson(data))}`;
}

export interface SerializedExport {
  readonly envelope: ExportEnvelope;
  readonly text: string;
}

/**
 * Canonical JSON of each top-level entry of `data`, computed once and shared by the
 * checksum and the file text (50 000 operations: one serialisation instead of two).
 */
interface CanonicalSection {
  readonly key: string;
  /** One canonical JSON string per entity, for arrays. */
  readonly items: readonly string[] | null;
  /** Canonical JSON of the value, for objects. */
  readonly value: string | null;
}

function canonicalSections(data: ExportData): CanonicalSection[] {
  const record = data as unknown as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => {
      const value = record[key];
      return Array.isArray(value)
        ? { key, items: value.map(canonicalJson), value: null }
        : { key, items: null, value: canonicalJson(value) };
    });
}

/** Same bytes as canonicalJson(data), rebuilt from the sections. */
function canonicalDataText(sections: readonly CanonicalSection[]): string {
  const entries = sections.map(
    (s) => `${JSON.stringify(s.key)}:${s.items ? `[${s.items.join(',')}]` : (s.value ?? 'null')}`,
  );
  return `{${entries.join(',')}}`;
}

export async function serializeExport(
  data: ExportData,
  appVersion: string,
  exportedAt: string,
): Promise<SerializedExport> {
  const normalized = normalizeExportData(data);
  const sections = canonicalSections(normalized);
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt,
    checksum: `sha256-${await sha256Hex(canonicalDataText(sections))}`,
    data: normalized,
  };
  return { envelope, text: textFromSections(envelope, sections) };
}

/**
 * Deterministic text: header fields first (as documented), then `data` with
 * canonical key order and one entity per line (byte-stable and diff-friendly).
 */
export function envelopeToText(envelope: ExportEnvelope): string {
  return textFromSections(envelope, canonicalSections(envelope.data));
}

function textFromSections(envelope: ExportEnvelope, sections: readonly CanonicalSection[]): string {
  const head = [
    `"format":${JSON.stringify(envelope.format)}`,
    `"schemaVersion":${envelope.schemaVersion}`,
    `"appVersion":${JSON.stringify(envelope.appVersion)}`,
    `"exportedAt":${JSON.stringify(envelope.exportedAt)}`,
    `"checksum":${JSON.stringify(envelope.checksum)}`,
  ];
  const body = sections.map((s) => {
    if (s.items) {
      const lines = s.items.map((item) => `  ${item}`).join(',\n');
      return `${JSON.stringify(s.key)}:[${s.items.length > 0 ? `\n${lines}\n` : ''}]`;
    }
    return `${JSON.stringify(s.key)}:${s.value ?? 'null'}`;
  });
  return `{${head.join(',')},\n"data":{\n${body.join(',\n')}\n}}\n`;
}

/** finances_AAAA-MM-JJ_HHmm.json in local time. */
export function exportFileName(now: Date, extension = 'json'): string {
  const p = (n: number): string => n.toString().padStart(2, '0');
  return `finances_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.${extension}`;
}

export type JsonImportIssue =
  | { readonly code: 'notJson' }
  | { readonly code: 'notExport' }
  | { readonly code: 'tooNew'; readonly fileVersion: number; readonly appVersion: number }
  | { readonly code: 'migrationFailed'; readonly fileVersion: number }
  | { readonly code: 'invalidData'; readonly issues: readonly string[] };

export type JsonImportResult =
  | {
      readonly ok: true;
      readonly data: ExportData;
      readonly fileSchemaVersion: number;
      readonly fileAppVersion: string;
      readonly exportedAt: string;
      readonly migrated: boolean;
      readonly checksumValid: boolean;
    }
  | { readonly ok: false; readonly issue: JsonImportIssue };

export async function parseExportJson(text: string): Promise<JsonImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, issue: { code: 'notJson' } };
  }
  const header = exportEnvelopeHeaderSchema.safeParse(raw);
  if (!header.success) return { ok: false, issue: { code: 'notExport' } };
  const { schemaVersion, appVersion, exportedAt, checksum } = header.data;
  if (schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      issue: { code: 'tooNew', fileVersion: schemaVersion, appVersion: SCHEMA_VERSION },
    };
  }
  // Checksum is verified on the data as written (before migration).
  const checksumValid = checksum === `sha256-${await sha256Hex(canonicalJson(header.data.data))}`;
  let migratedData: Record<string, unknown>;
  try {
    migratedData = migrateData(header.data.data, schemaVersion).data;
  } catch (error) {
    if (error instanceof MigrationError && error.code === 'tooNew') {
      return {
        ok: false,
        issue: { code: 'tooNew', fileVersion: schemaVersion, appVersion: SCHEMA_VERSION },
      };
    }
    return { ok: false, issue: { code: 'migrationFailed', fileVersion: schemaVersion } };
  }
  const parsed = exportDataSchema.safeParse(migratedData);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`);
    return { ok: false, issue: { code: 'invalidData', issues } };
  }
  return {
    ok: true,
    data: normalizeExportData(parsed.data),
    fileSchemaVersion: schemaVersion,
    fileAppVersion: appVersion,
    exportedAt,
    migrated: schemaVersion !== SCHEMA_VERSION,
    checksumValid,
  };
}

/**
 * Last-writer-wins merge by id on `updatedAt` (basis of the future file sync).
 * Returns the merged data and the ids whose incoming version won.
 */
export function mergeExportData(
  local: ExportData,
  incoming: ExportData,
): { data: ExportData; conflicts: number } {
  let conflicts = 0;
  const mergeList = <T extends { id: string; updatedAt?: string; importedAt?: string }>(
    a: readonly T[],
    b: readonly T[],
  ): T[] => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const item of b) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
        continue;
      }
      const ta = existing.updatedAt ?? existing.importedAt ?? '';
      const tb = item.updatedAt ?? item.importedAt ?? '';
      if (tb > ta) {
        map.set(item.id, item);
        conflicts += 1;
      }
    }
    return [...map.values()].sort(byId);
  };
  const data: ExportData = {
    accounts: mergeList(local.accounts, incoming.accounts),
    categories: mergeList(local.categories, incoming.categories),
    operations: mergeList(local.operations, incoming.operations),
    budgets: mergeList(local.budgets, incoming.budgets),
    recurrences: mergeList(local.recurrences, incoming.recurrences),
    rules: mergeList(local.rules, incoming.rules),
    tags: mergeList(local.tags, incoming.tags),
    goals: mergeList(local.goals, incoming.goals),
    importBatches: mergeList(local.importBatches, incoming.importBatches),
    settings:
      incoming.settings.updatedAt > local.settings.updatedAt ? incoming.settings : local.settings,
  };
  return { data, conflicts };
}
