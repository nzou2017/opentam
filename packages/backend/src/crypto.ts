// Copyright (C) 2026 Ning Zou <q.cue.2026@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:';

/**
 * Path to the auto-generated encryption key file.
 * Lives next to the database, outside the source tree.
 */
const KEY_FILE = resolve(process.cwd(), '.q-encryption-key');

let cachedKey: Buffer | null = null;

/**
 * Get (or auto-generate) the 32-byte AES-256 encryption key.
 *
 * Resolution order:
 * 1. Q_ENCRYPTION_KEY env var (64 hex chars) — for advanced users / CI
 * 2. `.q-encryption-key` file in the working directory — auto-created on first run
 *
 * The key file is created automatically so self-hosted users never need
 * to configure anything. Just make sure to back it up with your database.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. Explicit env var takes priority
  const envHex = process.env.Q_ENCRYPTION_KEY;
  if (envHex) {
    const buf = Buffer.from(envHex, 'hex');
    if (buf.length !== 32) {
      throw new Error('Q_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    cachedKey = buf;
    return cachedKey;
  }

  // 2. Read from key file, or generate one
  if (existsSync(KEY_FILE)) {
    const hex = readFileSync(KEY_FILE, 'utf8').trim();
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) {
      throw new Error(`.q-encryption-key contains invalid key (expected 64 hex chars)`);
    }
    cachedKey = buf;
    return cachedKey;
  }

  // 3. First run — generate and persist
  const newKey = randomBytes(32);
  writeFileSync(KEY_FILE, newKey.toString('hex') + '\n', { mode: 0o600 });
  cachedKey = newKey;
  return cachedKey;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns `enc:<iv>:<authTag>:<ciphertext>` (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value produced by `encrypt()`.
 * If the value doesn't have the `enc:` prefix, returns it as-is (plaintext migration).
 */
export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) return value;

  const key = getKey();
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
