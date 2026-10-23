/**
 * Defensive ZIP reading for OOXML files (fflate). Only the requested entries are
 * inflated and declared sizes are bounded to defuse zip bombs. Macros
 * (vbaProject.bin) are never extracted.
 */
import { strFromU8, unzipSync } from 'fflate';

export const MAX_ENTRY_SIZE = 50 * 1024 * 1024;
export const MAX_TOTAL_SIZE = 150 * 1024 * 1024;

export class ZipError extends Error {
  constructor(readonly code: 'notZip' | 'tooLarge' | 'corrupt') {
    super(code);
  }
}

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Inflates the entries accepted by `want` and returns them as UTF-8 strings. */
export function readZipTextEntries(
  bytes: Uint8Array,
  want: (name: string) => boolean,
): Map<string, string> {
  if (!isZip(bytes)) throw new ZipError('notZip');
  let total = 0;
  let tooLarge = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!want(file.name) || /vbaProject|\.bin$/i.test(file.name)) return false;
        if (file.originalSize > MAX_ENTRY_SIZE) {
          tooLarge = true;
          return false;
        }
        total += file.originalSize;
        if (total > MAX_TOTAL_SIZE) {
          tooLarge = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new ZipError('corrupt');
  }
  if (tooLarge) throw new ZipError('tooLarge');
  const out = new Map<string, string>();
  for (const [name, data] of Object.entries(files)) {
    if (data.length > MAX_ENTRY_SIZE) throw new ZipError('tooLarge');
    out.set(name, strFromU8(data));
  }
  return out;
}

/** Lists entry names without inflating anything. */
export function listZipEntries(bytes: Uint8Array): string[] {
  if (!isZip(bytes)) throw new ZipError('notZip');
  const names: string[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        return false;
      },
    });
  } catch {
    throw new ZipError('corrupt');
  }
  return names;
}
