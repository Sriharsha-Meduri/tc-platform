import { randomBytes, createHash } from 'crypto';

/**
 * Generates the raw bearer token embedded in an upload-link URL. 256 bits of
 * entropy, base64url-encoded so it's URL-safe with no padding to escape.
 * This value is returned exactly once (at creation) and never persisted —
 * only its hash is stored.
 */
export function generateUploadToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 hex digest — what actually gets stored/compared, never the raw token. */
export function hashUploadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
