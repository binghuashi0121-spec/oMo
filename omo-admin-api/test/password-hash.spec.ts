import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password-hash';

const legacyNodeArgon2Hash = '$argon2id$v=19$m=19456,p=1,t=2$AQEBAQEBAQEBAQEBAQEBAQ$nkGmyTHKAzNyVKZYZRUajt3BEYhxLJ1FMwXHI0wG+3I';

describe('password hashing', () => {
  it('verifies hashes created by the previous node-argon2 implementation', async () => {
    await expect(verifyPassword(legacyNodeArgon2Hash, 'CompatibilityPass123')).resolves.toBe(true);
    await expect(verifyPassword(legacyNodeArgon2Hash, 'wrong-password')).resolves.toBe(false);
  });

  it('creates encoded Argon2id hashes that can be verified', async () => {
    const hash = await hashPassword('FreshPassword123');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(verifyPassword(hash, 'FreshPassword123')).resolves.toBe(true);
  });
});
