// Smoke test for shared formatting/validation helpers (src/utils/format.ts).
import { describe, test, expect } from 'vitest';
import { PATTERNS, formatMoney, formatDate } from './format';

describe('PATTERNS', () => {
  test('username accepts valid, rejects too-short', () => {
    expect(PATTERNS.username.test('john.doe')).toBe(true);
    expect(PATTERNS.username.test('ab')).toBe(false);
  });

  test('password requires upper, lower, digit, symbol, length >= 8', () => {
    expect(PATTERNS.password.test('Password@123')).toBe(true);
    expect(PATTERNS.password.test('password')).toBe(false);
  });

  test('accountNumber is 10-20 digits', () => {
    expect(PATTERNS.accountNumber.test('1234567890')).toBe(true);
    expect(PATTERNS.accountNumber.test('123')).toBe(false);
  });
});

describe('formatMoney', () => {
  test('formats numbers as USD currency', () => {
    expect(formatMoney(1000)).toBe('$1,000.00');
  });

  test('treats null/undefined as 0', () => {
    expect(formatMoney(null)).toBe('$0.00');
    expect(formatMoney(undefined)).toBe('$0.00');
  });
});

describe('formatDate', () => {
  test('returns empty string for falsy input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
  });

  test('formats an ISO date to "YYYY-MM-DD HH:MM"', () => {
    expect(formatDate('2026-06-24T11:06:00.000Z')).toBe('2026-06-24 11:06');
  });
});
