/**
 * API token generation/hashing. Tokens are high-entropy random values shown to the admin
 * exactly once at creation time; only a SHA-256 hash is ever persisted, so a database leak
 * alone can't be used to authenticate — this is the same model GitHub/Stripe use for API
 * keys (deliberately not bcrypt: bcrypt's slow, salted hashing is for defending against
 * guessing low-entropy human passwords; a 256-bit random token has nothing to "guess", and
 * a fast, deterministic hash is what allows the O(1) indexed DB lookup the auth path needs).
 */

import { randomBytes, createHash } from 'crypto';

const TOKEN_PREFIX = 'scmp_';

export function generateToken(): { token: string; prefix: string; hash: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashToken(token),
  };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
