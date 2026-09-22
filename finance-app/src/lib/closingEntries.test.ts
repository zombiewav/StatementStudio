import { describe, it, expect } from 'vitest';
import { computeClosingEntryLines, findFiscalCloseBlockers } from './closingEntries';
import { Account, JournalEntry } from '../types';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '3010', name: 'General Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4010', name: 'Organization Income', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4040', name: 'Membership Dues', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '5020', name: 'Rent Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
];

describe('computeClosingEntryLines', () => {
  it('zeroes every revenue and expense account and plugs the surplus into Fund Balance as a credit', () => {
    const balances = { '1010': 3000, '4010': 5000, '4040': 2000, '5020': 4000 };
    const result = computeClosingEntryLines(balances, accounts, '3010');

    expect(result.totalRevenue).toBe(7000);
    expect(result.totalExpenses).toBe(4000);
    expect(result.netIncome).toBe(3000);

    expect(result.lines).toEqual(
      expect.arrayContaining([
        { accountCode: '4010', debit: 5000, credit: 0 },
        { accountCode: '4040', debit: 2000, credit: 0 },
        { accountCode: '5020', debit: 0, credit: 4000 },
        { accountCode: '3010', debit: 0, credit: 3000 },
      ])
    );
    // Never touches a permanent account other than the Fund Balance plug.
    expect(result.lines.find(l => l.accountCode === '1010')).toBeUndefined();
  });

  it('plugs a deficit into Fund Balance as a debit', () => {
    const balances = { '4010': 1000, '5020': 4000 };
    const result = computeClosingEntryLines(balances, accounts, '3010');

    expect(result.netIncome).toBe(-3000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        { accountCode: '4010', debit: 1000, credit: 0 },
        { accountCode: '5020', debit: 0, credit: 4000 },
        { accountCode: '3010', debit: 3000, credit: 0 },
      ])
    );
  });

  it('produces a balanced entry (debits equal credits) in both the surplus and deficit cases', () => {
    const cases: Record<string, number>[] = [
      { '4010': 5000, '4040': 2000, '5020': 4000 },
      { '4010': 1000, '5020': 4000 },
    ];
    for (const balances of cases) {
      const { lines } = computeClosingEntryLines(balances, accounts, '3010');
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
    }
  });

  it('skips the Fund Balance plug entirely when net income is exactly zero', () => {
    const balances = { '4010': 4000, '5020': 4000 };
    const result = computeClosingEntryLines(balances, accounts, '3010');
    expect(result.netIncome).toBe(0);
    expect(result.lines.find(l => l.accountCode === '3010')).toBeUndefined();
  });

  it('returns no lines when there is nothing to close', () => {
    const result = computeClosingEntryLines({}, accounts, '3010');
    expect(result.lines).toEqual([]);
    expect(result.netIncome).toBe(0);
  });

  it('never includes zero-balance accounts, even if present in the balances map', () => {
    const balances = { '4010': 0, '5020': 4000, '4040': 0 };
    const result = computeClosingEntryLines(balances, accounts, '3010');
    expect(result.lines.find(l => l.accountCode === '4010')).toBeUndefined();
    expect(result.lines.find(l => l.accountCode === '4040')).toBeUndefined();
  });
});

describe('findFiscalCloseBlockers', () => {
  it('blocks closing while a Review obligation is open and clears after settlement', () => {
    const reviewAccounts: Account[] = [
      ...accounts,
      { code: '2010', name: 'Due to Supplier', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
    ];
    const original: JournalEntry = {
      id: 'je-1', reference: 'JE-0001', date: '2026-01-01', description: 'Unpaid rent', project: 'General Fund Operations',
      lines: [{ accountCode: '5020', debit: 1000, credit: 0 }, { accountCode: '2010', debit: 0, credit: 1000 }],
    };
    const settlement: JournalEntry = {
      id: 'je-2', reference: 'JE-0002', date: '2026-01-02', description: 'Paid rent', project: 'General Fund Operations', settlesEntryId: 'je-1',
      lines: [{ accountCode: '2010', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
    };
    expect(findFiscalCloseBlockers([original], reviewAccounts)).toHaveLength(1);
    expect(findFiscalCloseBlockers([original, settlement], reviewAccounts)).toHaveLength(0);
  });

  it('blocks closing while temporarily restricted revenue has not been released', () => {
    const reviewAccounts: Account[] = [
      ...accounts,
      { code: '4030', name: 'Unrestricted Contributions', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
      { code: '4035', name: 'Temporarily Restricted Contributions', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
    ];
    const original: JournalEntry = {
      id: 'je-1', reference: 'JE-0001', date: '2026-01-01', description: 'Restricted sponsorship', project: 'General Fund Operations',
      lines: [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '4035', debit: 0, credit: 1000 }],
    };
    expect(findFiscalCloseBlockers([original], reviewAccounts)[0].restrictedRemaining).toBe(1000);
  });
});
