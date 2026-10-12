import { describe, expect, it } from 'vitest';
import { JournalEntry } from '../types';
import { officerBreakdown } from './officerBreakdown';

const entry = (id: string, date: string, transactionType: string, officer: string, lines: JournalEntry['lines'], extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date, description: transactionType, project: '', lines, transactionType,
  transactionDetails: { counterpartyName: officer, eventRelated: false, receiptAttachmentIds: [] },
  ...extra,
});

describe('officerBreakdown', () => {
  const paid = [
    entry('a', '2026-01-02', 'Cash In/Cash Out Fees', 'Juan A.', [{ accountCode: '5100', debit: 100, credit: 0 }, { accountCode: '2050', debit: 0, credit: 100 }]),
    entry('b', '2026-02-02', 'Acquisition of Merchandise for Sale - Goods Received and On Hand', 'juan a.', [{ accountCode: '1700', debit: 100, credit: 0 }, { accountCode: '2050', debit: 0, credit: 100 }]),
    entry('c', '2026-02-03', 'Purchase of Laptop', 'Juan A.', [{ accountCode: '1501', debit: 200, credit: 0 }, { accountCode: '2050', debit: 0, credit: 200 }]),
    entry('d', '2026-02-04', 'Purchase of Laptop', 'Jessa B.', [{ accountCode: '1501', debit: 900, credit: 0 }, { accountCode: '2050', debit: 0, credit: 900 }]),
  ];

  it('lists what the officer paid, the reimbursement and the remaining balance', () => {
    const reimbursement = entry('r', '2026-03-01', 'Reimbursement to Officer', 'Juan A.', [{ accountCode: '2050', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }]);
    const result = officerBreakdown([...paid, reimbursement], 'Juan A.');
    expect(result.rows.map(row => [row.date, row.transaction, row.amount])).toEqual([
      ['2026-01-02', 'Cash In/Cash Out Fees', 100],
      ['2026-02-02', 'Acquisition of Merchandise for Sale - Goods Received and On Hand', 100],
      ['2026-02-03', 'Purchase of Laptop', 200],
    ]);
    expect(result).toMatchObject({ total: 400, reimbursed: 100, remaining: 300 });
  });

  it('has nothing for an officer with no recorded purchase or expense', () => {
    expect(officerBreakdown(paid, 'Maria C.')).toEqual({ rows: [], total: 0, reimbursed: 0, remaining: 0 });
    expect(officerBreakdown(paid, '  ')).toEqual({ rows: [], total: 0, reimbursed: 0, remaining: 0 });
  });

  it('uses the date of each payment line when the entry has several dates', () => {
    const split = entry('s', '2026-04-01', 'Purchase of Printer', 'Juan A.', [
      { accountCode: '1503', debit: 500, credit: 0 },
      { accountCode: '2050', debit: 0, credit: 300, date: '2026-04-01' },
      { accountCode: '2050', debit: 0, credit: 200, date: '2026-04-09' },
    ]);
    expect(officerBreakdown([split], 'Juan A.').rows.map(row => [row.date, row.amount])).toEqual([['2026-04-01', 300], ['2026-04-09', 200]]);
  });

  it('ignores reversed entries and their reversals', () => {
    const original = entry('o', '2026-05-01', 'Purchase of Mouse', 'Juan A.', [{ accountCode: '1510', debit: 50, credit: 0 }, { accountCode: '2050', debit: 0, credit: 50 }], { reversedByEntryId: 'x' });
    const reversal = entry('x', '2026-05-02', 'Purchase of Mouse', 'Juan A.', [{ accountCode: '1510', debit: 0, credit: 50 }, { accountCode: '2050', debit: 50, credit: 0 }], { reversalOfEntryId: 'o' });
    expect(officerBreakdown([original, reversal], 'Juan A.')).toEqual({ rows: [], total: 0, reimbursed: 0, remaining: 0 });
  });

  it('never reports a negative remaining balance', () => {
    const over = entry('r', '2026-03-01', 'Reimbursement to Officer', 'Juan A.', [{ accountCode: '2050', debit: 500, credit: 0 }]);
    expect(officerBreakdown([paid[0], over], 'Juan A.').remaining).toBe(0);
  });
});
