import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption for the one long-lived credential this app keeps.
 *
 * RLS already holds the refresh token away from the browser, but RLS is a
 * property of the connection, not of the bytes. A database dump, a restored
 * backup, or one careless service-role query hands the token over in the
 * clear, and that token opens a calendar and a mailbox. At rest it is
 * ciphertext; the key lives in the environment, so having either one alone is
 * worth nothing.
 *
 * AES-256-GCM, so a tampered value fails to decrypt rather than decrypting to
 * something else.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Thrown for a missing key, a malformed key, and a value that will not open. */
export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretError';
  }
}

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new SecretError(
      'TOKEN_ENCRYPTION_KEY ontbreekt. Zonder sleutel wordt er geen token opgeslagen.',
    );
  }

  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== KEY_BYTES) {
    throw new SecretError(
      `TOKEN_ENCRYPTION_KEY moet ${KEY_BYTES} bytes zijn, base64 gecodeerd; deze is er ${bytes.length}.`,
    );
  }
  return bytes;
}

/** Whether a usable key is present, so a screen can say so before you try. */
export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 *
 * The version prefix is what makes a later key rotation or algorithm change
 * possible without guessing at what a stored value is, and it is what the
 * database check constraint matches on.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join(
    '.',
  );
}

export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretError('Het opgeslagen token heeft een onbekende vorm.');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const body = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES) {
    throw new SecretError('Het opgeslagen token heeft een onbekende vorm.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch (cause) {
    // Either the key changed or the value was altered; from here they look the
    // same, and both mean the connection has to be made again.
    if (cause instanceof SecretError) throw cause;
    throw new SecretError(
      'Het token kon niet ontsleuteld worden. Koppel Google opnieuw, of zet de oude sleutel terug.',
    );
  }
}
