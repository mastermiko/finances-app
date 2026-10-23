/**
 * Encrypted backup (.finances.enc): AES-GCM 256, key derived from the password
 * with PBKDF2-SHA-256 (600 000 iterations), random salt (16 B) and IV (12 B),
 * all through the native Web Crypto API.
 */

export const ENCRYPTED_FORMAT = 'finances-app-encrypted';
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 8;

export interface EncryptedFile {
  readonly format: typeof ENCRYPTED_FORMAT;
  readonly version: 1;
  readonly kdf: {
    readonly name: 'PBKDF2';
    readonly hash: 'SHA-256';
    readonly iterations: number;
    readonly salt: string;
  };
  readonly cipher: { readonly name: 'AES-GCM'; readonly iv: string };
  readonly data: string;
}

export class DecryptionError extends Error {
  constructor(readonly code: 'notEncrypted' | 'wrongPassword' | 'unsupported') {
    super(code);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(
  plaintext: string,
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const header = { format: ENCRYPTED_FORMAT, version: 1 } as const;
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(JSON.stringify(header)) },
    key,
    new TextEncoder().encode(plaintext),
  );
  const file: EncryptedFile = {
    ...header,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(file);
}

export function isEncryptedFile(text: string): boolean {
  return text.trimStart().startsWith('{') && text.includes(`"${ENCRYPTED_FORMAT}"`);
}

export async function decryptText(fileText: string, password: string): Promise<string> {
  let file: EncryptedFile;
  try {
    file = JSON.parse(fileText) as EncryptedFile;
  } catch {
    throw new DecryptionError('notEncrypted');
  }
  if (file.format !== ENCRYPTED_FORMAT) throw new DecryptionError('notEncrypted');
  if (file.version !== 1 || file.kdf.name !== 'PBKDF2' || file.cipher.name !== 'AES-GCM') {
    throw new DecryptionError('unsupported');
  }
  if (
    !Number.isInteger(file.kdf.iterations) ||
    file.kdf.iterations < 100_000 ||
    file.kdf.iterations > 10_000_000
  ) {
    throw new DecryptionError('unsupported');
  }
  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(file.cipher.iv) as BufferSource,
        additionalData: new TextEncoder().encode(
          JSON.stringify({ format: file.format, version: file.version }),
        ),
      },
      key,
      fromBase64(file.data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new DecryptionError('wrongPassword');
  }
}

/** Rough strength estimate (0–4) shown next to the password field. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score += 1;
  return score;
}
