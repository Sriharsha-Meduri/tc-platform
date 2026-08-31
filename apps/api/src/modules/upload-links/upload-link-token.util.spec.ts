import { generateUploadToken, hashUploadToken } from './upload-link-token.util';

describe('upload-link-token.util', () => {
  it('generates a URL-safe token with no padding/reserved characters', () => {
    const token = generateUploadToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(40); // 256 bits base64url-encoded
  });

  it('generates a different token on every call', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateUploadToken()));
    expect(tokens.size).toBe(50);
  });

  it('hashes the same token to the same value every time', () => {
    const token = generateUploadToken();
    expect(hashUploadToken(token)).toBe(hashUploadToken(token));
  });

  it('hashes different tokens to different values', () => {
    const a = generateUploadToken();
    const b = generateUploadToken();
    expect(hashUploadToken(a)).not.toBe(hashUploadToken(b));
  });

  it('produces a 64-character lowercase hex sha256 digest', () => {
    const hash = hashUploadToken(generateUploadToken());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
