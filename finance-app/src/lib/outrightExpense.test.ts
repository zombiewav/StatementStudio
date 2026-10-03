import { describe, expect, it } from 'vitest';
import { buildOutrightExpensePosting } from './outrightExpense';

describe('buildOutrightExpensePosting', () => {
  it('posts a split expense and leaves the unpaid amount due to the supplier', () => {
    const posting = buildOutrightExpensePosting({
      expenseAccountCode: '5030', totalAmount: 1_000, paymentMethod: 'combination', transactionDate: '2026-01-01',
      organizationPayments: [{ date: '2026-01-01', amount: 200 }],
      officerPayments: [{ date: '2026-01-01', amount: 300 }],
      advancePayments: [{ date: '2026-01-01', amount: 100 }], availableCash: 200, availableAdvance: 100,
    });
    expect(posting.dueToSupplier).toBe(400);
    expect(posting.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '5030', debit: 1000 }),
      expect.objectContaining({ accountCode: '1010', credit: 200 }),
      expect.objectContaining({ accountCode: '2050', credit: 300 }),
      expect.objectContaining({ accountCode: '1250', credit: 100 }),
      expect.objectContaining({ accountCode: '2010', credit: 400 }),
    ]));
  });

  it('uses a later batch to clear the original payable', () => {
    const posting = buildOutrightExpensePosting({ expenseAccountCode: '5030', totalAmount: 1000, paymentMethod: 'organization-funds', transactionDate: '2026-01-01', organizationPayments: [{ date: '2026-01-02', amount: 1000 }], availableCash: 1000 });
    expect(posting.dueToSupplier).toBe(1000);
    expect(posting.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '2010', debit: 1000, date: '2026-01-02' })]));
  });

  it('records an expense payable next reporting period as expense and Accounts Payable', () => {
    const posting = buildOutrightExpensePosting({
      expenseAccountCode: '5030', totalAmount: 1_000, paymentMethod: 'not-yet-paid', transactionDate: '2026-12-31',
    });
    expect(posting.dueToSupplier).toBe(1_000);
    expect(posting.lines).toEqual([
      { accountCode: '5030', debit: 1_000, credit: 0, date: '2026-12-31' },
      { accountCode: '2010', debit: 0, credit: 1_000, date: '2026-12-31' },
    ]);
  });

  it('routes an unpaid PPE purchase to its dedicated payable account', () => {
    const posting = buildOutrightExpensePosting({
      expenseAccountCode: '1500', totalAmount: 2500, paymentMethod: 'organization-funds',
      organizationPayments: [{ date: '', amount: 1000 }], availableCash: 1000,
      payableAccountCode: '2030',
    });
    expect(posting.lines).toEqual([
      { accountCode: '1500', debit: 2500, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 1000 },
      { accountCode: '2030', debit: 0, credit: 1500 },
    ]);
  });

  it('rejects advance use over the recorded balance', () => {
    expect(() => buildOutrightExpensePosting({ expenseAccountCode: '5030', totalAmount: 100, paymentMethod: 'officer-advance', advancePayments: [{ date: '2026-01-01', amount: 101 }], availableAdvance: 100 })).toThrow('cannot exceed');
  });
});
