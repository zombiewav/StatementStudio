import { describe, expect, it } from 'vitest';
import { buildPriorPeriodPayablePayment, remainingPriorPeriodPayable } from './payablePayments';

describe('prior-period payable payments', () => {
  it('posts a mixed payment against the selected payable', () => {
    const result = buildPriorPeriodPayablePayment({ payableAccountCode: '2030', paymentMethod: 'combination', transactionDate: '2026-10-03', paymentDate: '', organizationAmount: 200, officerAmount: 100, advanceAmount: 150, remainingOpeningBalance: 500, availableCash: 200, availableAdvance: 150 });
    expect(result.total).toBe(450);
    expect(result.lines).toEqual([
      { accountCode: '2030', debit: 450, credit: 0, date: '2026-10-03' },
      { accountCode: '1010', debit: 0, credit: 200, date: '2026-10-03' },
      { accountCode: '1250', debit: 0, credit: 150, date: '2026-10-03' },
      { accountCode: '2050', debit: 0, credit: 100, date: '2026-10-03' },
    ]);
  });

  it('blocks payments beyond the opening payable, cash, or officer advance', () => {
    const base = { payableAccountCode: '2010' as const, transactionDate: '2026-10-03', paymentDate: '', remainingOpeningBalance: 100, availableCash: 100, availableAdvance: 100 };
    expect(() => buildPriorPeriodPayablePayment({ ...base, paymentMethod: 'organization-funds', organizationAmount: 101 })).toThrow(/beginning balance/i);
    expect(() => buildPriorPeriodPayablePayment({ ...base, paymentMethod: 'organization-funds', organizationAmount: 100, availableCash: 99 })).toThrow(/cash balance/i);
    expect(() => buildPriorPeriodPayablePayment({ ...base, paymentMethod: 'officer-advance', advanceAmount: 100, availableAdvance: 99 })).toThrow(/advance balance/i);
  });

  it('tracks repeated payments only against the original opening balance', () => {
    expect(remainingPriorPeriodPayable(1000, '2010', [
      { transactionDetails: { priorPeriodPayableAccountCode: '2010', priorPeriodPayablePaymentAmount: 250 } },
      { transactionDetails: { priorPeriodPayableAccountCode: '2030', priorPeriodPayablePaymentAmount: 300 } },
      { transactionDetails: { priorPeriodPayableAccountCode: '2010', priorPeriodPayablePaymentAmount: 400 } },
    ])).toBe(350);
  });
});
