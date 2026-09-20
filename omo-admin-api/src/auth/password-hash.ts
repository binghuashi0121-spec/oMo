import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

export const passwordHashOptions = {
  memorySize: 19_456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  const encoded = await argon2id({
    password,
    salt: randomBytes(16),
    ...passwordHashOptions,
    outputType: 'encoded',
  });
  if (typeof encoded !== 'string') throw new Error('Argon2 encoded hash generation failed');
  return encoded;
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2Verify({ hash, password });
}
