import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, isEncryptionConfigured, SecretError } from '@/lib/server/secrets';

/**
 * The refresh token is the only long-lived credential the app holds. RLS keeps
 * it away from the browser; this keeps it away from anyone holding a copy of
 * the database.
 */
const KEY = randomBytes(32).toString('base64');
const OTHER = randomBytes(32).toString('base64');

describe('secrets', () => {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = previous;
  });

  it('returns what went in', () => {
    const token = '1//0gK_a-real-looking-refresh-token.with-dots';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('carries non-ascii through unharmed', () => {
    expect(decryptSecret(encryptSecret('sleutel — ü'))).toBe('sleutel — ü');
  });

  it('never writes the plaintext into the stored value', () => {
    const stored = encryptSecret('SECRET-TOKEN');
    expect(stored).not.toContain('SECRET-TOKEN');
    expect(Buffer.from(stored.split('.')[3], 'base64url').toString('utf8')).not.toContain('SECRET');
  });

  it('uses a fresh iv each time, so the same token stores differently', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('is shaped the way the database constraint expects', () => {
    expect(encryptSecret('x')).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('refuses a value whose ciphertext was altered', () => {
    const parts = encryptSecret('SECRET-TOKEN').split('.');
    const body = Buffer.from(parts[3], 'base64url');
    body[0] ^= 0xff;
    parts[3] = body.toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow(SecretError);
  });

  it('refuses a value whose tag was altered', () => {
    const parts = encryptSecret('SECRET-TOKEN').split('.');
    const tag = Buffer.from(parts[2], 'base64url');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow(SecretError);
  });

  it('refuses a value written under a different key', () => {
    const stored = encryptSecret('SECRET-TOKEN');
    process.env.TOKEN_ENCRYPTION_KEY = OTHER;
    expect(() => decryptSecret(stored)).toThrow(SecretError);
  });

  it('refuses a plaintext token, rather than passing it along', () => {
    expect(() => decryptSecret('1//0gPlainRefreshToken')).toThrow(SecretError);
  });

  it('refuses an unknown version prefix', () => {
    const stored = encryptSecret('SECRET-TOKEN');
    expect(() => decryptSecret(`v2${stored.slice(2)}`)).toThrow(SecretError);
  });

  it('will not encrypt without a key', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('SECRET-TOKEN')).toThrow(SecretError);
  });

  it('will not accept a key of the wrong length', () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('SECRET-TOKEN')).toThrow(/32 bytes/);
  });

  it('reports a usable key', () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
});
