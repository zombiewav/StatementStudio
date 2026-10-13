import { describe, expect, it } from 'vitest';
import { buildBuyerDownpaymentPosting, buyerDownpaymentTotal } from './buyerDownpayments';

describe('buildBuyerDownpaymentPosting', () => {
  it('debits Cash and credits Unearned Merchandise Revenue for the initial downpayment', () => {
    expect(buildBuyerDownpaymentPosting({ initial: { date: '2026-10-05', amount: 500 } })).toEqual([
      { accountCode: '1010', debit: 500, credit: 0, date: '2026-10-05' },
      { accountCode: '2140', debit: 0, credit: 500, date: '2026-10-05' },
    ]);
  });

  it('adds subsequent downpayments, one balanced pair per date, with a blank date using the initial date', () => {
    const lines = buildBuyerDownpaymentPosting({
      initial: { date: '2026-10-05', amount: 500 },
      subsequent: [{ date: '', amount: 100 }, { date: '2026-10-20', amount: 250 }, { date: '2026-10-21', amount: 0 }],
    });
    expect(lines).toEqual([
      { accountCode: '1010', debit: 600, credit: 0, date: '2026-10-05' },
      { accountCode: '2140', debit: 0, credit: 600, date: '2026-10-05' },
      { accountCode: '1010', debit: 250, credit: 0, date: '2026-10-20' },
      { accountCode: '2140', debit: 0, credit: 250, date: '2026-10-20' },
    ]);
    expect(buyerDownpaymentTotal(lines)).toBe(850);
  });

  it('requires an initial downpayment and its date', () => {
    expect(() => buildBuyerDownpaymentPosting({ initial: { date: '2026-10-05', amount: 0 } })).toThrow('initial downpayment');
    expect(() => buildBuyerDownpaymentPosting({ initial: { date: '', amount: 100 } })).toThrow('date of the initial downpayment');
  });

  it('rejects negative subsequent downpayments', () => {
    expect(() => buildBuyerDownpaymentPosting({ initial: { date: '2026-10-05', amount: 100 }, subsequent: [{ date: '', amount: -5 }] })).toThrow('cannot be negative');
  });
});
