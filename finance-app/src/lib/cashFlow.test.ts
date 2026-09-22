import { describe, expect, it } from 'vitest';
import { Account, JournalEntry } from '../types';
import { computeCashFlowDetails } from './cashFlow';

const accounts: Account[] = [
  { code: '1010', name: 'Cash', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1500', name: 'Equipment', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '2200', name: 'Loan', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '3010', name: 'Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4010', name: 'Revenue', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
  { code: '5020', name: 'Expense', type: 'Expenses', normalBalance: 'Debit', description: '', isActive: true },
];

const entry = (id: string, date: string, lines: JournalEntry['lines']): JournalEntry => ({
  id, reference: id, date, description: id, project: 'General Fund Operations', lines,
});

describe('computeCashFlowDetails', () => {
  it('uses cumulative cash before the selected range as beginning cash', () => {
    const entries = [
      entry('JE-1', '2025-12-31', [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '3010', debit: 0, credit: 1000 }]),
      entry('JE-2', '2026-01-10', [{ accountCode: '1010', debit: 400, credit: 0 }, { accountCode: '4010', debit: 0, credit: 400 }]),
      entry('JE-3', '2026-01-11', [{ accountCode: '5020', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }]),
    ];
    const result = computeCashFlowDetails(entries, accounts, '2026-01-01', '2026-12-31');
    expect(result.beginningCash).toBe(1000);
    expect(result.netOperating).toBe(300);
    expect(result.endingCash).toBe(1300);
  });

  it('treats capital introduced during the period as financing, not beginning cash', () => {
    const result = computeCashFlowDetails([
      entry('JE-1', '2026-01-01', [{ accountCode: '1010', debit: 2500, credit: 0 }, { accountCode: '3010', debit: 0, credit: 2500 }]),
    ], accounts, '2026-01-01', '2026-12-31');
    expect(result.beginningCash).toBe(0);
    expect(result.netFinancing).toBe(2500);
    expect(result.endingCash).toBe(2500);
  });

  it('classifies equipment purchases and loan receipts/repayments correctly', () => {
    const result = computeCashFlowDetails([
      entry('JE-1', '2026-02-01', [{ accountCode: '1010', debit: 3000, credit: 0 }, { accountCode: '2200', debit: 0, credit: 3000 }]),
      entry('JE-2', '2026-03-01', [{ accountCode: '1500', debit: 800, credit: 0 }, { accountCode: '1010', debit: 0, credit: 800 }]),
      entry('JE-3', '2026-04-01', [{ accountCode: '2200', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }]),
    ], accounts, '2026-01-01', '2026-12-31');
    expect(result.netInvesting).toBe(-800);
    expect(result.netFinancing).toBe(2500);
    expect(result.endingCash).toBe(1700);
  });
});
