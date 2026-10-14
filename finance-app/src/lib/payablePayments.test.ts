import { describe, expect, it } from 'vitest';
import { buildPriorPeriodPayablePayment, PRIOR_PERIOD_PAYABLE_CHOICES, PRIOR_PERIOD_PAYABLE_CODES, outstandingPayableBalance } from './payablePayments';

describe('prior-period payable payments', () => {
  it('posts a mixed payment against the selected payable', () => {
    const result = buildPriorPeriodPayablePayment({ payableAccountCode: '2030', paymentMethod: 'combination', transactionDate: '2026-10-03', paymentDate: '', organizationAmount: 200, officerAmount: 100, advanceAmount: 150, outstandingBalance: 500, availableCash: 200, availableAdvance: 150 });
    expect(result.total).toBe(450);
    expect(result.lines).toEqual([
      { accountCode: '2030', debit: 450, credit: 0, date: '2026-10-03' },
      { accountCode: '1010', debit: 0, credit: 200, date: '2026-10-03' },
      { accountCode: '1250', debit: 0, credit: 150, date: '2026-10-03' },
      { accountCode: '2050', debit: 0, credit: 100, date: '2026-10-03' },
    ]);
  });

  it('blocks payments beyond the outstanding payable, cash, or officer advance', () => {
    const base = { payableAccountCode: '2010' as const, transactionDate: '2026-10-03', paymentDate: '', outstandingBalance: 100, availableCash: 100, availableAdvance: 100 };
    expect(() => buildPriorPeriodPayablePayment({ ...base, paymentMethod: 'organization-funds', organizationAmount: 101 })).toThrow(/outstanding balance/i);
    expect(() => buildPriorPeriodPayablePayment({ ...base, paymentMethod: 'organization-funds', organizationAmount: 100, availableCash: 99 })).toThrow(/cash balance/i);
    expect(() => buildPriorPeriodPayablePayment({ ...base, paymentMethod: 'officer-advance', advanceAmount: 100, availableAdvance: 99 })).toThrow(/advance balance/i);
  });

  it('limits payment to the live outstanding balance of the payable account', () => {
    const balances = { '2010': 350, '2030': 0, '2062': -20 };
    expect(outstandingPayableBalance(balances, '2010')).toBe(350);
    expect(outstandingPayableBalance(balances, '2030')).toBe(0);
    expect(outstandingPayableBalance(balances, '2062')).toBe(0);
    expect(outstandingPayableBalance(balances, '2064')).toBe(0);
  });

  it('accepts each category-specific prepaid and other asset payable account', () => {
    expect(PRIOR_PERIOD_PAYABLE_CODES).toEqual(expect.arrayContaining(['2061', '2062', '2063', '2064']));
    expect(PRIOR_PERIOD_PAYABLE_CODES).not.toContain('2060');
    const result = buildPriorPeriodPayablePayment({ payableAccountCode: '2062', paymentMethod: 'organization-funds', transactionDate: '2026-10-03', paymentDate: '', organizationAmount: 300, outstandingBalance: 500, availableCash: 300, availableAdvance: 0 });
    expect(result.lines).toEqual([
      { accountCode: '2062', debit: 300, credit: 0, date: '2026-10-03' },
      { accountCode: '1010', debit: 0, credit: 300, date: '2026-10-03' },
    ]);
  });
});

describe('Payables dropdown choices', () => {
  it('lists the 8 choices from the sheet in order, one per payable account', () => {
    expect(PRIOR_PERIOD_PAYABLE_CHOICES.map(choice => choice.code)).toEqual(['2010', '2030', '2040', '2020', '2061', '2062', '2063', '2064']);
    expect([...PRIOR_PERIOD_PAYABLE_CHOICES.map(choice => choice.code)].sort()).toEqual([...PRIOR_PERIOD_PAYABLE_CODES].sort());
    expect(PRIOR_PERIOD_PAYABLE_CHOICES[0].label).toBe('Payment of Accounts Payable from Previous Period – Expenses');
    expect(PRIOR_PERIOD_PAYABLE_CHOICES[7].label).toBe('Payment of Accounts Payable from Previous Period - Clothing/Uniform');
  });
});
