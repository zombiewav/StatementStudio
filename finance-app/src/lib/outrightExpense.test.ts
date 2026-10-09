import { describe, expect, it } from 'vitest';
import { buildOutrightExpensePosting, splitBalancedJournalLinesByDate } from './outrightExpense';

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
    expect(posting.dueToSupplier).toBe(0);
    expect(posting.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '2010', debit: 1000, date: '2026-01-02' })]));
  });

  it.each([
    ['expense', '5030', '2010'],
    ['PPE', '1500', '2030'],
    ['furniture and fixtures', '1650', '2040'],
  ])('uses one related-payable debit for a later combination batch for %s', (_label, accountCode, payableCode) => {
    const posting = buildOutrightExpensePosting({
      expenseAccountCode: accountCode, payableAccountCode: payableCode, totalAmount: 1000, paymentMethod: 'combination', transactionDate: '2026-01-01',
      organizationPayments: [{ date: '2026-01-01', amount: 100 }, { date: '2026-01-02', amount: 150 }],
      officerPayments: [{ date: '2026-01-01', amount: 100 }, { date: '2026-01-02', amount: 100 }],
      advancePayments: [{ date: '2026-01-01', amount: 100 }, { date: '2026-01-02', amount: 50 }],
      availableCash: 250, availableAdvance: 150,
    });
    expect(posting.dueToSupplier).toBe(400);
    expect(posting.lines.filter(line => line.accountCode === payableCode && line.date === '2026-01-02')).toEqual([
      { accountCode: payableCode, debit: 300, credit: 0, date: '2026-01-02' },
    ]);
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

  it.each([
    ['expense', '5030', '2010'],
    ['PPE', '1500', '2030'],
  ])('does not allow %s payments to exceed the purchase price', (_label, accountCode, payableAccountCode) => {
    expect(() => buildOutrightExpensePosting({
      expenseAccountCode: accountCode,
      payableAccountCode,
      totalAmount: 100,
      paymentMethod: 'organization-funds',
      organizationPayments: [{ date: '2026-01-01', amount: 101 }],
      availableCash: 101,
    })).toThrow('Total payment cannot exceed the expense amount.');
  });
});

describe('splitBalancedJournalLinesByDate', () => {
  it('returns a separate balanced journal batch for each date', () => {
    const batches = splitBalancedJournalLinesByDate([
      { accountCode: '5030', debit: 100, credit: 0, date: '2026-01-01' },
      { accountCode: '2010', debit: 0, credit: 100, date: '2026-01-01' },
      { accountCode: '2010', debit: 40, credit: 0, date: '2026-01-02' },
      { accountCode: '2050', debit: 0, credit: 40, date: '2026-01-02' },
    ], '2026-01-01');
    expect(batches.map(batch => batch.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(batches.every(batch => batch.lines.reduce((sum, line) => sum + line.debit, 0) === batch.lines.reduce((sum, line) => sum + line.credit, 0))).toBe(true);
  });

  it('keeps unbalanced date groups together', () => {
    const lines = [
      { accountCode: '5030', debit: 100, credit: 0, date: '2026-01-01' },
      { accountCode: '1010', debit: 0, credit: 100, date: '2026-01-02' },
    ];
    expect(splitBalancedJournalLinesByDate(lines, '2026-01-01')).toEqual([{ date: '2026-01-01', lines }]);
  });
});
