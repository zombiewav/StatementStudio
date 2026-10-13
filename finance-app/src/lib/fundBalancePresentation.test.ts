import { describe, expect, it } from 'vitest';
import { Account, ClosingRecord, JournalEntry } from '../types';
import { accumulatedNetPosition } from './fundBalancePresentation';
import { computeAccountBalances, computeTypeTotals } from './accountTotals';
import { computeDirectClosingLines, excludeClosingEntries } from './closingEntries';

const account = (code: string, name: string, type: Account['type'], normalBalance: Account['normalBalance']): Account => ({ code, name, type, normalBalance, description: '', isActive: true });
const accounts: Account[] = [
  account('1010', 'Cash on Hand', 'Assets', 'Debit'),
  account('3010', 'Fund Balance', 'Fund Balance', 'Credit'),
  account('4040', 'Membership Dues', 'Revenue', 'Credit'),
  account('4050', 'Other Income', 'Revenue', 'Credit'),
  account('5130', 'Communication Expense', 'Expenses', 'Debit'),
  account('5150', 'Freight Expense', 'Expenses', 'Debit'),
  account('5100', 'Delivery Fee Expense', 'Expenses', 'Debit'),
  account('5040', 'Office Supplies Expense', 'Expenses', 'Debit'),
];

let counter = 0;
const entry = (lines: JournalEntry['lines']): JournalEntry => ({ id: `e${++counter}`, reference: `JE-${counter}`, date: '2026-10-10', description: `entry ${counter}`, project: 'General Fund Operations', lines });
const revenue = (dues: number, other: number) => [
  entry([{ accountCode: '1010', debit: dues + other, credit: 0 }, { accountCode: '4040', debit: 0, credit: dues }, { accountCode: '4050', debit: 0, credit: other }]),
];
const expenses = (communication: number) => [
  entry([{ accountCode: '5130', debit: communication, credit: 0 }, { accountCode: '1010', debit: 0, credit: communication }]),
  entry([{ accountCode: '5150', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }]),
  entry([{ accountCode: '5100', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }]),
  entry([{ accountCode: '5040', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }]),
];

describe('accumulatedNetPosition', () => {
  it('calls a positive result a surplus and a negative one a deficit shown as negative', () => {
    expect(accumulatedNetPosition(1000)).toEqual({ label: 'Accumulated Net Surplus', amount: 1000 });
    expect(accumulatedNetPosition(-1000)).toEqual({ label: 'Accumulated Net Deficit', amount: -1000 });
    expect(accumulatedNetPosition(0)).toEqual({ label: 'Accumulated Net Surplus', amount: 0 });
  });
});

describe('closing example from the client (surplus and deficit)', () => {
  const scenario = (dues: number, other: number, communication: number) => {
    const entries = [...revenue(dues, other), ...expenses(communication)];
    const balances = computeAccountBalances(entries, accounts);
    const totals = computeTypeTotals(balances, accounts);
    const closing = computeDirectClosingLines(balances, accounts);
    return { entries, balances, totals, closing };
  };

  it('revenue 5k vs expenses 4k: revenue debited, expenses credited, 1k credited to Fund Balance', () => {
    const { closing, totals } = scenario(4000, 1000, 1000);
    expect(closing.netIncome).toBe(1000);
    expect(closing.lines).toEqual([
      { accountCode: '4040', debit: 4000, credit: 0 },
      { accountCode: '4050', debit: 1000, credit: 0 },
      { accountCode: '5130', debit: 0, credit: 1000 },
      { accountCode: '5150', debit: 0, credit: 1000 },
      { accountCode: '5100', debit: 0, credit: 1000 },
      { accountCode: '5040', debit: 0, credit: 1000 },
      { accountCode: '3010', debit: 0, credit: 1000 },
    ]);
    expect(accumulatedNetPosition(totals.Revenue - totals.Expenses)).toEqual({ label: 'Accumulated Net Surplus', amount: 1000 });
  });

  it('revenue 4k vs expenses 5k: the 1k excess of expenses is debited to Fund Balance', () => {
    const { closing, totals } = scenario(3000, 1000, 2000);
    expect(closing.netIncome).toBe(-1000);
    expect(closing.lines[0]).toEqual({ accountCode: '3010', debit: 1000, credit: 0 });
    expect(closing.lines.filter(line => line.accountCode === '3010')).toHaveLength(1);
    expect(accumulatedNetPosition(totals.Revenue - totals.Expenses)).toEqual({ label: 'Accumulated Net Deficit', amount: -1000 });
  });

  it('equal revenue and expenses leave no surplus or deficit line', () => {
    const { closing } = scenario(2000, 2000, 1000);
    expect(closing.netIncome).toBe(0);
    expect(closing.lines.some(line => line.accountCode === '3010')).toBe(false);
  });

  it('Financial Position agrees before and after closing, while performance statements ignore the closing entry', () => {
    [{ dues: 4000, other: 1000, communication: 1000, net: 1000 }, { dues: 3000, other: 1000, communication: 2000, net: -1000 }].forEach(({ dues, other, communication, net }) => {
      const { entries, totals, closing } = scenario(dues, other, communication);
      const closingEntry = entry(closing.lines);
      const record = { id: 'c', fiscalYear: 'FY', closingDate: '2026-10-31', netIncome: net, journalEntryId: closingEntry.id, closedAt: '', completed: true } as ClosingRecord;
      const afterClosing = [...entries, closingEntry];
      const postTotals = computeTypeTotals(computeAccountBalances(afterClosing, accounts), accounts);

      // Statement of Financial Position: Fund Balance carries the surplus (+) or deficit (-) either way.
      expect(postTotals['Fund Balance']).toBe(net);
      expect(postTotals.Assets).toBe(totals.Assets);
      expect(postTotals.Revenue).toBe(0);
      expect(postTotals.Expenses).toBe(0);
      expect(postTotals.Assets).toBe(postTotals.Liabilities + postTotals['Fund Balance']);

      // Statement of Activities / Functional Expense: use the balances as they were before closing.
      const performance = computeTypeTotals(computeAccountBalances(excludeClosingEntries(afterClosing, [record]), accounts), accounts);
      expect(performance.Revenue).toBe(totals.Revenue);
      expect(performance.Expenses).toBe(totals.Expenses);
    });
  });
});
