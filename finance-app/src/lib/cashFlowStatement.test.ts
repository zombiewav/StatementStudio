import { describe, expect, it } from 'vitest';
import { Account, JournalEntry, JournalLine } from '../types';
import { buildCashFlowStatement } from './cashFlowStatement';

const account = (code: string, name: string, type: Account['type'], normalBalance: Account['normalBalance']): Account => ({ code, name, type, normalBalance, description: '', isActive: true });
const accounts: Account[] = [
  account('1010', 'Cash on Hand', 'Assets', 'Debit'),
  account('1015', 'Cash in Bank', 'Assets', 'Debit'),
  account('1270', 'Advances to Suppliers', 'Assets', 'Debit'),
  account('1501', 'Laptop', 'Assets', 'Debit'),
  account('1651', 'Cabinet', 'Assets', 'Debit'),
  account('2050', 'Due to Officers', 'Liabilities', 'Credit'),
  account('2140', 'Unearned Merchandise Revenue', 'Liabilities', 'Credit'),
  account('4040', 'Membership Dues', 'Revenue', 'Credit'),
  account('4070', 'Merchandise Sales', 'Revenue', 'Credit'),
  account('5040', 'Office Supplies Expense', 'Expenses', 'Debit'),
];

let counter = 0;
const entry = (date: string, lines: JournalLine[], extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `e${++counter}`, reference: `JE-${counter}`, date, description: `entry ${counter}`, project: 'General Fund Operations', lines, ...extra,
});
const statement = (entries: JournalEntry[], opening = 0) => buildCashFlowStatement(entries, accounts, '2026-08-01', '2026-12-31', opening);
const D = '2026-10-05';

describe('Statement of Cash Flows rules', () => {
  it('rule 1: an entry with no cash account produces no cash flow', () => {
    const result = statement([entry(D, [{ accountCode: '5040', debit: 500, credit: 0 }, { accountCode: '2050', debit: 0, credit: 500 }])]);
    expect(result.receipts).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.netChange).toBe(0);
  });

  it('rule 2 and 3: cash debited is a receipt under the credited account (client example)', () => {
    const result = statement([entry(D, [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '2140', debit: 0, credit: 1000 }])]);
    expect(result.receipts).toEqual([{ key: '2140', label: 'Unearned Merchandise Revenue', amount: 1000 }]);
    expect(result.totalReceipts).toBe(1000);
    expect(result.payments).toEqual([]);
  });

  it('rule 3: only the actual cash credited is shown against the debited account (client example)', () => {
    const result = statement([entry(D, [
      { accountCode: '1270', debit: 1000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 500 },
      { accountCode: '2140', debit: 0, credit: 500 },
    ])]);
    expect(result.payments).toEqual([{ key: '1270', label: 'Advances to Suppliers', amount: 500 }]);
    expect(result.receipts).toEqual([]);
    expect(result.netOperating).toBe(-500);
  });

  it('rule 3: cash is split across several related accounts in proportion and never counted twice', () => {
    const result = statement([entry(D, [
      { accountCode: '5040', debit: 600, credit: 0 },
      { accountCode: '1270', debit: 400, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 500 },
      { accountCode: '2050', debit: 0, credit: 500 },
    ])]);
    expect(result.payments).toEqual([
      { key: '1270', label: 'Advances to Suppliers', amount: 200 },
      { key: '5040', label: 'Office Supplies Expense', amount: 300 },
    ]);
    expect(result.totalPayments).toBe(500);
  });

  it('keeps cents exact when a split does not divide evenly', () => {
    const result = statement([entry(D, [
      { accountCode: '5040', debit: 100, credit: 0 },
      { accountCode: '1270', debit: 100, credit: 0 },
      { accountCode: '1501', debit: 100, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 100 },
      { accountCode: '2050', debit: 0, credit: 200 },
    ])]);
    expect(result.totalPayments + result.equipmentPurchases).toBe(100);
  });

  it('rule 4: only cash paid for equipment and furniture is investing (client example)', () => {
    const result = statement([
      entry(D, [{ accountCode: '1501', debit: 2000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }, { accountCode: '2050', debit: 0, credit: 1000 }]),
      entry(D, [{ accountCode: '1651', debit: 800, credit: 0 }, { accountCode: '1010', debit: 0, credit: 800 }]),
    ]);
    expect(result.equipmentPurchases).toBe(1000);
    expect(result.furniturePurchases).toBe(800);
    expect(result.netInvesting).toBe(-1800);
    expect(result.payments).toEqual([]);
    expect(result.netOperating).toBe(0);
    expect(result.netChange).toBe(-1800);
  });

  it('rule 5: transfers between cash accounts are not receipts or payments', () => {
    const result = statement([entry(D, [{ accountCode: '1015', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }])]);
    expect(result.receipts).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.netChange).toBe(0);
  });

  it('rule 5: a reversed entry and its reversal in the same period cancel out', () => {
    const original = entry(D, [{ accountCode: '1010', debit: 700, credit: 0 }, { accountCode: '4040', debit: 0, credit: 700 }]);
    const reversal = entry('2026-10-06', [{ accountCode: '4040', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }], { reversalOfEntryId: original.id });
    original.reversedByEntryId = reversal.id;
    const result = statement([original, reversal]);
    expect(result.receipts).toEqual([]);
    expect(result.payments).toEqual([]);
    expect(result.reconcilesToLedger).toBe(true);
  });

  it('keeps the reversal when the original belongs to an earlier period', () => {
    const original = entry('2026-07-20', [{ accountCode: '1010', debit: 700, credit: 0 }, { accountCode: '4040', debit: 0, credit: 700 }]);
    const reversal = entry('2026-10-06', [{ accountCode: '4040', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }], { reversalOfEntryId: original.id });
    original.reversedByEntryId = reversal.id;
    const result = statement([original, reversal]);
    expect(result.beginningCash).toBe(700);
    expect(result.payments).toEqual([{ key: '4040', label: 'Membership Dues', amount: 700 }]);
    expect(result.endingCash).toBe(0);
    expect(result.reconcilesToLedger).toBe(true);
  });

  it('ignores drafts', () => {
    const result = statement([entry(D, [{ accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '4040', debit: 0, credit: 100 }], { isDraft: true })]);
    expect(result.netChange).toBe(0);
  });

  it('rule 6: groups by category, totals, and adds beginning cash to reach an ending cash that matches the ledger', () => {
    const result = statement([
      entry('2026-07-15', [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]),
      entry('2026-09-01', [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '4070', debit: 0, credit: 1000 }]),
      entry('2026-09-02', [{ accountCode: '1010', debit: 500, credit: 0 }, { accountCode: '4070', debit: 0, credit: 500 }]),
      entry('2026-09-03', [{ accountCode: '5040', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }]),
      entry('2026-09-04', [{ accountCode: '1501', debit: 1200, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1200 }]),
    ], 1000);
    expect(result.beginningCash).toBe(6000);
    expect(result.receipts).toEqual([{ key: '4070', label: 'Merchandise Sales', amount: 1500 }]);
    expect(result.payments).toEqual([{ key: '5040', label: 'Office Supplies Expense', amount: 300 }]);
    expect(result.netOperating).toBe(1200);
    expect(result.netInvesting).toBe(-1200);
    expect(result.netChange).toBe(0);
    expect(result.endingCash).toBe(6000);
    expect(result.ledgerCash).toBe(6000);
    expect(result.reconcilesToLedger).toBe(true);
  });

  it('uses each cash line\'s own posting date for the period', () => {
    const result = statement([entry('2026-11-01', [
      { accountCode: '1010', debit: 400, credit: 0, date: '2026-07-30' },
      { accountCode: '1010', debit: 600, credit: 0, date: '2026-11-02' },
      { accountCode: '4070', debit: 0, credit: 1000 },
    ])]);
    expect(result.beginningCash).toBe(400);
    expect(result.receipts).toEqual([{ key: '4070', label: 'Merchandise Sales', amount: 600 }]);
    expect(result.endingCash).toBe(1000);
  });

  it('puts a cash line with no related account under Other', () => {
    const result = statement([entry(D, [{ accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '5040', debit: 50, credit: 0 }, { accountCode: '1015', debit: 0, credit: 150 }])]);
    expect(result.receipts).toEqual([{ key: 'other', label: 'Other receipts', amount: 100 }]);
    expect(result.payments).toEqual([{ key: '5040', label: 'Office Supplies Expense', amount: 150 }]);
  });
});
