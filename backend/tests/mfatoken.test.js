// tests/mfa.test.js
const crypto = require('crypto');
const { generateMfaToken, parseMfaToken } = require('../src/routes/auth');

// Mock the encryption key (use a fixed key for testing)
const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV_LENGTH = 16;

describe('MFA Token Utilities', () => {
  const mockPayload = {
    id: '123',
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@test.com',
    role: 'user',
    account_number: '1234567890',
    isSetupPending: false
  };

  // ============================================
  // 1. SUCCESSFUL TOKEN GENERATION
  // ============================================

  test('should generate a valid token with correct structure', () => {
    const token = generateMfaToken(mockPayload);
    const parts = token.split(':');
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[a-f0-9]+$/); // IV is hex
    expect(parts[1]).toMatch(/^[a-f0-9]+$/); // Encrypted is hex
    expect(parts[2]).toMatch(/^[a-f0-9]+$/); // Auth tag is hex
  });

  test('should generate different tokens for same payload', () => {
    const token1 = generateMfaToken(mockPayload);
    const token2 = generateMfaToken(mockPayload);
    
    // Each token should be unique due to random IV
    expect(token1).not.toBe(token2);
  });

  // ============================================
  // 2. SUCCESSFUL TOKEN PARSING
  // ============================================
  test('should parse a valid token successfully', () => {
    const token = generateMfaToken(mockPayload);
    const result = parseMfaToken(token);
    
    expect(result).toBeDefined();
    expect(result).toMatchObject({
      id: '123',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@test.com',
      role: 'user',
      account_number: '1234567890',
      isSetupPending: false,
      attempts: 0,
      exp: expect.any(Number)
    });
  });

  test('should preserve all payload fields', () => {
    const payload = {
      id: '456',
      username: 'john_doe',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@test.com',
      role: 'admin',
      account_number: '9876543210',
      isSetupPending: true,
      customField: 'custom_value'
    };
    
    const token = generateMfaToken(payload);
    const result = parseMfaToken(token);
    
    expect(result).toMatchObject(payload);
    expect(result.customField).toBe('custom_value');
  });

  test('should include attempts counter starting at 0', () => {
    const token = generateMfaToken(mockPayload);
    const result = parseMfaToken(token);
    
    expect(result.attempts).toBe(0);
  });

  // ============================================
  // 3. EXPIRATION TESTS
  // ============================================
  test('should set expiration to 5 minutes from now', () => {
    const before = Date.now();
    const token = generateMfaToken(mockPayload);
    const result = parseMfaToken(token);
    
    expect(result.exp).toBeGreaterThanOrEqual(before + 4.9 * 60 * 1000);
    expect(result.exp).toBeLessThanOrEqual(before + 5.1 * 60 * 1000);
  });
  test('should return null for expired token', () => {
    // Save current time
    const fixedTime = Date.now();

    // Generate token at fixedTime
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedTime);
    const token = generateMfaToken(mockPayload);

    // Parse at fixedTime + 10 minutes
    dateNowSpy.mockReturnValue(fixedTime + 600000);
    const result = parseMfaToken(token);

    dateNowSpy.mockRestore();

    expect(result).toBeNull();
    });

  // ============================================
  // 4. INVALID TOKEN TESTS
  // ============================================
  test('should return null for malformed token', () => {
    const invalidTokens = [
      'invalid',
      'too:few:parts:',
      'abc:def:ghi:jkl',
      '',
      null,
      undefined
    ];
    
    invalidTokens.forEach(token => {
      expect(parseMfaToken(token)).toBeNull();
    });
  });

  test('should return null for token with corrupted data', () => {
    const token = generateMfaToken(mockPayload);
    const parts = token.split(':');
    const corruptedToken = `${parts[0]}:corrupted:${parts[2]}`;
    expect(parseMfaToken(corruptedToken)).toBeNull();
  });


  // ============================================
  // 5. EDGE CASES
  // ============================================
  test('should handle empty payload gracefully', () => {
    const token = generateMfaToken({});
    const result = parseMfaToken(token);
    
    expect(result).toBeDefined();
    expect(result.attempts).toBe(0);
    expect(result.exp).toBeDefined();
  });

  test('should handle payload with special characters', () => {
    const payload = {
      id: '123',
      username: 'user@#$%^&*()',
      email: 'test+special@test.com'
    };
    
    const token = generateMfaToken(payload);
    const result = parseMfaToken(token);
    
    expect(result.username).toBe('user@#$%^&*()');
    expect(result.email).toBe('test+special@test.com');
  });

  test('should handle very large payload', () => {
    const payload = {
      id: '123',
      largeData: 'a'.repeat(10000)
    };
    
    const token = generateMfaToken(payload);
    const result = parseMfaToken(token);
    
    expect(result.largeData).toBe('a'.repeat(10000));
  });

  test('should handle multiple tokens simultaneously', () => {
    const tokens = Array.from({ length: 10 }, () => generateMfaToken(mockPayload));
    const results = tokens.map(token => parseMfaToken(token));
    
    results.forEach(result => {
      expect(result).toMatchObject({
        id: '123',
        username: 'testuser'
      });
    });
  });

  // ============================================
  // 6. SECURITY TESTS
  // ============================================
  test('should not expose sensitive data in token', () => {
    const token = generateMfaToken(mockPayload);
    
    // Token should not contain plaintext data
    expect(token).not.toContain('testuser');
    expect(token).not.toContain('test@test.com');
    expect(token).not.toContain('1234567890');
  });

  test('should have consistent token length for same payload', () => {
    const token1 = generateMfaToken(mockPayload);
    const token2 = generateMfaToken(mockPayload);
    
    // Tokens should be similar length (though IV is random)
    expect(Math.abs(token1.length - token2.length)).toBeLessThan(10);
  });
});