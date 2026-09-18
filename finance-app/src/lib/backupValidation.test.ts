import { describe, it, expect } from 'vitest';
import { validateBackupPayload } from './backupValidation';

const validPayload = {
  schemaVersion: 1,
  exportedAt: '2026-09-15T00:00:00.000Z',
  organizationName: 'Bicol University',
  accounts: [{ code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true }],
  journalEntries: [],
  projects: [],
  auditLogs: [],
  settings: { fiscalYear: 'FY 2026', organizationName: 'Bicol University', currencySymbol: '₱', currencyCode: 'PHP' },
};

describe('validateBackupPayload', () => {
  it('accepts a well-formed backup', () => {
    expect(validateBackupPayload(validPayload)).toEqual({ valid: true });
  });

  it('rejects null', () => {
    expect(validateBackupPayload(null).valid).toBe(false);
  });

  it('rejects a random unrelated JSON object', () => {
    expect(validateBackupPayload({ hello: 'world' }).valid).toBe(false);
  });

  it('rejects a payload with an empty accounts array', () => {
    expect(validateBackupPayload({ ...validPayload, accounts: [] }).valid).toBe(false);
  });

  it('rejects a payload with accounts missing entirely', () => {
    const { accounts, ...rest } = validPayload;
    expect(validateBackupPayload(rest).valid).toBe(false);
  });

  it('rejects a payload where journalEntries is not an array', () => {
    expect(validateBackupPayload({ ...validPayload, journalEntries: 'oops' }).valid).toBe(false);
  });

  it('rejects a payload missing settings', () => {
    const { settings, ...rest } = validPayload;
    expect(validateBackupPayload(rest).valid).toBe(false);
  });

  it('rejects a payload with settings missing organizationName', () => {
    expect(validateBackupPayload({ ...validPayload, settings: { fiscalYear: 'FY 2026' } }).valid).toBe(false);
  });

  it('gives a human-readable reason on failure', () => {
    const result = validateBackupPayload({ ...validPayload, journalEntries: undefined });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/journal entries/i);
  });
});
