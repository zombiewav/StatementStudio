// Validates a parsed backup file before it's ever applied to the app's
// state. Kept as a pure function (no React, no localStorage) so both the
// Settings page's pre-restore confirmation step and FinanceContext's own
// restore function can check the same thing without duplicating the rule.
import { BackupPayload } from '../types';

export interface BackupValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateBackupPayload(payload: unknown): BackupValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'This file does not contain a valid StatementStudio backup.' };
  }

  const p = payload as Partial<BackupPayload>;

  if (!Array.isArray(p.accounts) || p.accounts.length === 0) {
    return { valid: false, reason: 'Backup is missing its Chart of Accounts.' };
  }

  if (!Array.isArray(p.journalEntries)) {
    return { valid: false, reason: 'Backup is missing its journal entries.' };
  }

  if (!p.settings || typeof p.settings !== 'object' || !('organizationName' in p.settings)) {
    return { valid: false, reason: 'Backup is missing its organization settings.' };
  }

  return { valid: true };
}
