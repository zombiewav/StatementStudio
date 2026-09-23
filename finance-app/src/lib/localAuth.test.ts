import { describe, expect, it } from 'vitest';
import { credentialsMatch, isValidEmail, normalizeEmail, readOrgAccount } from './localAuth';

describe('localAuth', () => {
  it('normalizes and validates organization email addresses', () => {
    expect(normalizeEmail(' Finance@Example.ORG ')).toBe('finance@example.org');
    expect(isValidEmail('finance@example.org')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('reads valid accounts and rejects damaged storage', () => {
    expect(readOrgAccount('{bad json')).toBeNull();
    expect(readOrgAccount(JSON.stringify({ organizationName: '', password: 'secret', createdAt: 'today' }))).toBeNull();
    expect(readOrgAccount(JSON.stringify({ organizationName: 'Org', email: ' ADMIN@ORG.COM ', password: 'secret', createdAt: 'today' }))).toEqual({
      organizationName: 'Org',
      email: 'admin@org.com',
      password: 'secret',
      createdAt: 'today',
    });
  });

  it('requires email for new accounts but keeps legacy password-only accounts working', () => {
    const current = { organizationName: 'Org', email: 'admin@org.com', password: 'secret', createdAt: 'today' };
    const legacy = { organizationName: 'Old Org', password: 'secret', createdAt: 'today' };

    expect(credentialsMatch(current, 'ADMIN@ORG.COM', 'secret')).toBe(true);
    expect(credentialsMatch(current, 'other@org.com', 'secret')).toBe(false);
    expect(credentialsMatch(legacy, '', 'secret')).toBe(true);
  });
});
