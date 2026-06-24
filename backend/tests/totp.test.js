// Smoke test for the TOTP 2FA helper (src/utils/totp.js).
// Pure crypto, no DB or network — safe to run in CI.
const speakeasy = require('speakeasy');
const { generateSecret, verifyTOTP } = require('../src/utils/totp');

describe('totp 2FA helper', () => {
  test('generateSecret returns a non-empty Base32 string', () => {
    const secret = generateSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
    // Base32 alphabet only (RFC 4648).
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  });

  test('verifyTOTP accepts a freshly generated token', () => {
    const secret = generateSecret();
    const token = speakeasy.totp({ secret, encoding: 'base32' });
    expect(verifyTOTP(token, secret)).toBe(true);
  });

  test('verifyTOTP rejects an obviously wrong token', () => {
    const secret = generateSecret();
    expect(verifyTOTP('000000', secret)).toBe(false);
  });
});
