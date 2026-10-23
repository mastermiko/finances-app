/**
 * UUID v7 (RFC 9562): 48-bit Unix timestamp in ms + random bits.
 * Monotonic within the same millisecond thanks to a 12-bit counter (method 1).
 */

export type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const defaultRandom: RandomSource = (bytes) => {
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

let lastTimestamp = -1;
let counter = 0;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function uuidv7(now: number = Date.now(), random: RandomSource = defaultRandom): string {
  const bytes = random(new Uint8Array(16));
  let ts = Math.floor(now);
  if (ts <= lastTimestamp) {
    ts = lastTimestamp;
    counter += 1;
    if (counter > 0xfff) {
      // Counter overflow: borrow the next millisecond to stay monotonic.
      ts += 1;
      counter = 0;
    }
  } else {
    counter = ((bytes[6] ?? 0) << 4) & 0x7ff; // random start, keeps headroom
  }
  lastTimestamp = ts;
  // 48-bit big-endian timestamp
  const high = Math.floor(ts / 2 ** 16);
  const low = ts % 2 ** 16;
  bytes[0] = (high >>> 24) & 0xff;
  bytes[1] = (high >>> 16) & 0xff;
  bytes[2] = (high >>> 8) & 0xff;
  bytes[3] = high & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  // version 7 + 12-bit counter
  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  // variant 10xx
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += HEX[bytes[i] ?? 0] ?? '00';
    if (i === 3 || i === 5 || i === 7 || i === 9) out += '-';
  }
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Extracts the creation timestamp (ms) embedded in a UUID v7. */
export function uuidv7Timestamp(id: string): number | null {
  if (!isUuid(id) || id.charAt(14) !== '7') return null;
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
