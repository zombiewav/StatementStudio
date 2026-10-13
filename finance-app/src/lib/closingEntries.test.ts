import { describe, it, expect } from 'vitest';
import { computeClosingEntryLines, computeClosingStageLines, computeDirectClosingLines, excludeClosingEntries, findFiscalCloseBlockers } from './closingEntries';
import { Account, ClosingRecord, JournalEntry } from '../types';
import { computeAccountBalances } from './accountTotals';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '3010', name: 'General Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true },
  { code: '3030', name: 'Permanently Restricted Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4010', name: 'Organization Income', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4040', name: 'Membership Dues', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4036', name: 'Contributions Revenue - Permanently Restricted', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
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

describe('staged closing entries', () => {
  it('closes revenues, then expenses, then Income Summary into accumulated surplus', () => {
    expect(computeClosingStageLines({ '4010': 1000 }, accounts, 'revenue', '3010')).toEqual([{ accountCode: '4010', debit: 1000, credit: 0 }, { accountCode: '3000', debit: 0, credit: 1000 }]);
    expect(computeClosingStageLines({ '5020': 400 }, accounts, 'expense', '3010')).toEqual([{ accountCode: '3000', debit: 400, credit: 0 }, { accountCode: '5020', debit: 0, credit: 400 }]);
    expect(computeClosingStageLines({ '3000': 600 }, accounts, 'income-summary', '3010')).toEqual([{ accountCode: '3000', debit: 600, credit: 0 }, { accountCode: '3010', debit: 0, credit: 600 }]);
  });

  it('closes permanently restricted contribution revenue directly into permanently restricted fund balance', () => {
    expect(computeClosingStageLines({ '4036': 1000 }, accounts, 'revenue', '3010')).toEqual([
      { accountCode: '4036', debit: 1000, credit: 0 },
      { accountCode: '3030', debit: 0, credit: 1000 },
    ]);
  });
});

describe('findFiscalCloseBlockers', () => {
  it('blocks closing while a Review obligation is open and clears after settlement', () => {
    const reviewAccounts: Account[] = [
      ...accounts,
      { code: '1285', name: 'Supplies and Materials', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
      { code: '2010', name: 'Due to Supplier', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
    ];
    const original: JournalEntry = {
      id: 'je-1', reference: 'JE-0001', date: '2026-01-01', description: 'Bought supplies', project: 'General Fund Operations',
      lines: [{ accountCode: '1285', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
    };
    const consumption: JournalEntry = {
      id: 'je-2', reference: 'JE-0002', date: '2026-01-02', description: 'Used supplies', project: 'General Fund Operations', settlesEntryId: 'je-1',
      lines: [{ accountCode: '5020', debit: 1000, credit: 0 }, { accountCode: '1285', debit: 0, credit: 1000 }],
    };
    expect(findFiscalCloseBlockers([original], reviewAccounts)).toHaveLength(1);
    expect(findFiscalCloseBlockers([original, consumption], reviewAccounts)).toHaveLength(0);
  });

  it('does not block closing for unpaid payables, which carry to the next period', () => {
    const reviewAccounts: Account[] = [
      ...accounts,
      { code: '2010', name: 'Accounts Payable - Expense', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
    ];
    const unpaid: JournalEntry = {
      id: 'je-1', reference: 'JE-0001', date: '2026-01-01', description: 'Unpaid rent', project: 'General Fund Operations',
      lines: [{ accountCode: '5020', debit: 1000, credit: 0 }, { accountCode: '2010', debit: 0, credit: 1000 }],
    };
    expect(findFiscalCloseBlockers([unpaid], reviewAccounts)).toHaveLength(0);
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

describe('excludeClosingEntries', () => {
  it('keeps ordinary activity while removing recorded closing entries from performance reports', () => {
    const activity = entryForCloseTest('je-1', 'Membership dues');
    const closing = entryForCloseTest('je-2', 'Closing Entries — FY 2026');
    const records: ClosingRecord[] = [{
      id: 'close-1',
      fiscalYear: 'FY 2026',
      closingDate: '2026-12-31',
      netIncome: 300,
      journalEntryId: 'je-2',
      closedAt: '2026-12-31T12:00:00.000Z',
    }];

    expect(excludeClosingEntries([activity, closing], records)).toEqual([activity]);
  });
});

function entryForCloseTest(id: string, description: string): JournalEntry {
  return {
    id,
    reference: id.toUpperCase(),
    date: '2026-12-31',
    description,
    project: 'General Fund Operations',
    lines: [],
  };
}

describe('computeDirectClosingLines (client worked examples)', () => {
  const coa: Account[] = [
    { code: '4040', name: 'Membership Fees', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
    { code: '4050', name: 'Other Income', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
    { code: '5010', name: 'Communication Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
    { code: '5020', name: 'Freight Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
    { code: '5030', name: 'Delivery Fees Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
    { code: '5040', name: 'Cleaning Supplies Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
  ];
  const sum = (lines: { debit: number; credit: number }[], key: 'debit' | 'credit') => lines.reduce((total, line) => total + line[key], 0);

  it('credits Fund Balance when revenue exceeds expenses', () => {
    const result = computeDirectClosingLines({ '4040': 18000, '4050': 2000, '5010': 1000, '5020': 2000, '5030': 3000, '5040': 4000 }, coa);
    expect(result.netIncome).toBe(10000);
    expect(result.lines).toEqual([
      { accountCode: '4040', debit: 18000, credit: 0 }, { accountCode: '4050', debit: 2000, credit: 0 },
      { accountCode: '5010', debit: 0, credit: 1000 }, { accountCode: '5020', debit: 0, credit: 2000 },
      { accountCode: '5030', debit: 0, credit: 3000 }, { accountCode: '5040', debit: 0, credit: 4000 },
      { accountCode: '3010', debit: 0, credit: 10000 },
    ]);
    expect(sum(result.lines, 'debit')).toBe(sum(result.lines, 'credit'));
  });

  it('debits Fund Balance first when expenses exceed revenue', () => {
    const result = computeDirectClosingLines({ '4040': 7000, '4050': 2000, '5010': 1000, '5020': 2000, '5030': 3000, '5040': 4000 }, coa);
    expect(result.netIncome).toBe(-1000);
    expect(result.lines[0]).toEqual({ accountCode: '3010', debit: 1000, credit: 0 });
    expect(result.lines).toHaveLength(7);
    expect(sum(result.lines, 'debit')).toBe(sum(result.lines, 'credit'));
  });

  it('returns no lines when nothing is left to close', () => {
    expect(computeDirectClosingLines({}, coa).lines).toEqual([]);
  });

  it.each([
    ['surplus', { '4040': 18000, '4050': 2000, '5010': 1000, '5020': 2000, '5030': 3000, '5040': 4000 }],
    ['deficit', { '4040': 7000, '4050': 2000, '5010': 1000, '5020': 2000, '5030': 3000, '5040': 4000 }],
  ])('leaves every revenue and expense account at zero once the %s entry is posted', (_label, balances) => {
    const debitLine = (code: string, amount: number) => ({ accountCode: code, debit: amount, credit: 0 });
    const creditLine = (code: string, amount: number) => ({ accountCode: code, debit: 0, credit: amount });
    const opening = Object.entries(balances).map(([code, amount]) => (code.startsWith('4') ? creditLine(code, amount) : debitLine(code, amount)));
    const closing = computeDirectClosingLines(balances, coa).lines;
    const all = [...coa, { code: '3010', name: 'Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true } as Account];
    const entry = (id: string, lines: typeof closing) => ({ id, reference: id, date: '2026-05-31', description: id, project: 'p', lines } as JournalEntry);
    const after = computeAccountBalances([entry('open', opening), entry('close', closing)], all);
    coa.forEach(account => expect(after[account.code]).toBe(0));
  });
});
