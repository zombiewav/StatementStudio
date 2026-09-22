import { describe, it, expect } from 'vitest';
import {
  deriveEffect,
  resolveEntry,
  checkEntryEffects,
  buildJournalLines,
  projectJournalLineImpacts,
  computeStatementImpact,
  FUNDING_SOURCE_OPTIONS,
  UnknownAccountError,
} from './journalEngine';
import { Account } from '../types';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1015', name: 'Cash in Bank', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1250', name: 'Advances to Officers', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '2010', name: 'Accounts Payable', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '2050', name: 'Due to Officers', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '5070', name: 'Repairs & Maintenance Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
];

describe('deriveEffect', () => {
  it('is Increase when posting to an asset/expense account\'s debit side', () => {
    expect(deriveEffect(accounts[0], 'debit')).toBe('Increase');
  });

  it('is Decrease when posting to an asset/expense account\'s credit side', () => {
    expect(deriveEffect(accounts[0], 'credit')).toBe('Decrease');
  });

  it('is Increase when posting to a liability account\'s credit side', () => {
    const dueToOfficers = accounts.find(a => a.code === '2050')!;
    expect(deriveEffect(dueToOfficers, 'credit')).toBe('Increase');
  });

  it('is Decrease when posting to a liability account\'s debit side', () => {
    const dueToOfficers = accounts.find(a => a.code === '2050')!;
    expect(deriveEffect(dueToOfficers, 'debit')).toBe('Decrease');
  });
});

describe('resolveEntry', () => {
  it('resolves a normal expense payment as Increase (debit) / Decrease (credit)', () => {
    const resolved = resolveEntry(accounts, '5070', '1010');
    expect(resolved.debitEffect).toBe('Increase');
    expect(resolved.creditEffect).toBe('Decrease');
  });

  it('resolves crediting a liability (Due to Officers) as Increase, not Decrease', () => {
    const resolved = resolveEntry(accounts, '5070', '2050');
    expect(resolved.creditEffect).toBe('Increase');
  });

  it('throws UnknownAccountError for a debit code that does not exist', () => {
    expect(() => resolveEntry(accounts, '9999', '1010')).toThrow(UnknownAccountError);
  });

  it('throws UnknownAccountError for a credit code that does not exist', () => {
    expect(() => resolveEntry(accounts, '1010', '9999')).toThrow(UnknownAccountError);
  });
});

describe('checkEntryEffects', () => {
  it('reports ok: true when the expected effects match reality', () => {
    const result = checkEntryEffects(accounts, '5070', '1010', 'Increase', 'Decrease');
    expect(result.ok).toBe(true);
  });

  // Regression case for the working paper's own typo: "Paid for the repair
  // of printer" (ADDITIONAL row 28) is labelled Increase/Increase, but
  // crediting Cash can only ever be a Decrease. This is exactly the kind of
  // mismatch the Phase 3 conformance suite is built to catch automatically.
  it('reports ok: false when an expected effect does not match reality', () => {
    const result = checkEntryEffects(accounts, '5070', '1010', 'Increase', 'Increase');
    expect(result.ok).toBe(false);
    expect(result.debitMatches).toBe(true);
    expect(result.creditMatches).toBe(false);
  });
});

describe('buildJournalLines', () => {
  it('builds two balanced lines for the given amount', () => {
    const lines = buildJournalLines('5070', '1010', 500);
    expect(lines).toEqual([
      { accountCode: '5070', debit: 500, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 500 },
    ]);
    expect(lines[0].debit).toBe(lines[1].credit);
  });
});

describe('posting previews', () => {
  it('projects account balances using each account normal balance', () => {
    const lines = buildJournalLines('5070', '2010', 500);
    const impacts = projectJournalLineImpacts(lines, accounts, { '5070': 100, '2010': 300 });
    expect(impacts.find(item => item.accountCode === '5070')?.after).toBe(600);
    expect(impacts.find(item => item.accountCode === '2010')?.after).toBe(800);
  });

  it('treats a credit to accumulated depreciation as a decrease in total Assets', () => {
    const contra: Account = { code: '1550', name: 'Accumulated Depreciation', type: 'Assets', normalBalance: 'Credit', description: '', isActive: true };
    const depreciation: Account = { code: '5090', name: 'Depreciation Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true };
    const impact = computeStatementImpact(buildJournalLines('5090', '1550', 250), [...accounts, contra, depreciation]);
    expect(impact.assetChange).toBe(-250);
    expect(impact.netIncomeChange).toBe(-250);
  });
});

describe('FUNDING_SOURCE_OPTIONS', () => {
  it('has exactly one option per real account in the Chart of Accounts', () => {
    for (const option of FUNDING_SOURCE_OPTIONS) {
      const account = accounts.find(a => a.code === option.creditAccountCode);
      expect(account, `${option.id} points at missing account ${option.creditAccountCode}`).toBeDefined();
    }
  });

  it('covers the five funding sources demonstrated in the working paper', () => {
    const ids = FUNDING_SOURCE_OPTIONS.map(o => o.id).sort();
    expect(ids).toEqual([
      'cash-in-bank',
      'cash-on-hand',
      'officer-cash-advance',
      'officer-personal-money',
      'on-account',
    ]);
  });
});
