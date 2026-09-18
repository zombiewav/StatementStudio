import { describe, it, expect } from 'vitest';
import { computeAccountBalances, computeTypeTotals, isContraAccount } from './accountTotals';
import { Account, JournalEntry } from '../types';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1500', name: 'Equipment & Tools', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1550', name: 'Accumulated Depreciation', type: 'Assets', normalBalance: 'Credit', description: '', isActive: true },
  { code: '2010', name: 'Accounts Payable', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '3010', name: 'General Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4010', name: 'Organization Income', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '5090', name: 'Depreciation Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
];

function entry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'je-1',
    reference: 'JE-0001',
    date: '2026-01-01',
    description: '',
    project: '',
    lines: [],
    ...overrides,
  };
}

describe('isContraAccount', () => {
  it('is false for every account whose normalBalance matches its type\'s natural polarity', () => {
    expect(isContraAccount(accounts.find(a => a.code === '1010')!)).toBe(false);
    expect(isContraAccount(accounts.find(a => a.code === '2010')!)).toBe(false);
    expect(isContraAccount(accounts.find(a => a.code === '4010')!)).toBe(false);
    expect(isContraAccount(accounts.find(a => a.code === '5090')!)).toBe(false);
  });

  it('is true for a Credit-normal Assets account (a contra-asset)', () => {
    expect(isContraAccount(accounts.find(a => a.code === '1550')!)).toBe(true);
  });
});

describe('computeAccountBalances', () => {
  it('grows a Debit-normal account with debits, shrinks it with credits', () => {
    const balances = computeAccountBalances(
      [entry({ lines: [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '4010', debit: 0, credit: 1000 }] })],
      accounts
    );
    expect(balances['1010']).toBe(1000);
  });

  it('grows a Credit-normal contra-asset account with credits, in its own polarity', () => {
    const balances = computeAccountBalances(
      [entry({ lines: [{ accountCode: '5090', debit: 5000, credit: 0 }, { accountCode: '1550', debit: 0, credit: 5000 }] })],
      accounts
    );
    expect(balances['1550']).toBe(5000);
  });

  it('zeroes every account with no postings', () => {
    const balances = computeAccountBalances([], accounts);
    expect(balances['1010']).toBe(0);
    expect(balances['1550']).toBe(0);
  });
});

describe('computeTypeTotals', () => {
  it('sums natural-polarity accounts straightforwardly (today\'s behavior, unchanged)', () => {
    const balances = computeAccountBalances(
      [entry({ lines: [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '3010', debit: 0, credit: 1000 }] })],
      accounts
    );
    const totals = computeTypeTotals(balances, accounts);
    expect(totals.Assets).toBe(1000);
    expect(totals['Fund Balance']).toBe(1000);
  });

  it('subtracts a contra-asset balance from Total Assets instead of adding it', () => {
    const entries = [
      // Buy equipment for 25,000 cash
      entry({ id: 'je-1', lines: [{ accountCode: '1500', debit: 25000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 25000 }] }),
      // Depreciate 5,000 of it
      entry({ id: 'je-2', lines: [{ accountCode: '5090', debit: 5000, credit: 0 }, { accountCode: '1550', debit: 0, credit: 5000 }] }),
    ];
    const balances = computeAccountBalances(entries, accounts);
    const totals = computeTypeTotals(balances, accounts);

    // Cash -25,000 + Equipment +25,000 nets Assets to 0 before depreciation;
    // the contra-asset must then subtract its 5,000, landing Assets at -5,000
    // (an intentionally lopsided fixture, chosen so a sign error is obvious).
    expect(totals.Assets).toBe(-5000);
    expect(totals.Expenses).toBe(5000);
  });

  it('leaves every non-Assets total unaffected by a contra-asset posting', () => {
    const entries = [
      entry({ lines: [{ accountCode: '5090', debit: 5000, credit: 0 }, { accountCode: '1550', debit: 0, credit: 5000 }] }),
    ];
    const balances = computeAccountBalances(entries, accounts);
    const totals = computeTypeTotals(balances, accounts);
    expect(totals.Liabilities).toBe(0);
    expect(totals['Fund Balance']).toBe(0);
    expect(totals.Revenue).toBe(0);
  });
});
