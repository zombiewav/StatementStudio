import { describe, expect, it } from 'vitest';
import { buildMerchandiseAcquisitionPosting } from './merchandiseAcquisition';

describe('merchandise acquisition posting', () => {
  it('records an organization payment and leaves the unpaid cost in Merchandise Payable', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'organization-funds',
      organizationPayment: 600,
    })).toEqual({
      lines: [
        { accountCode: '1700', debit: 1000, credit: 0 },
        { accountCode: '1010', debit: 0, credit: 600 },
        { accountCode: '2020', debit: 0, credit: 400 },
      ],
      merchandisePayable: 400,
      dueToOfficer: 0,
      advanceUsed: 0,
      cashPaid: 600,
    });
  });

  it('separates an officer payment, reimbursement, and unpaid supplier balance', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'officer-personal',
      officerPayment: 700,
      reimbursement: 200,
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0 },
      { accountCode: '2050', debit: 0, credit: 700 },
      { accountCode: '2050', debit: 200, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 200 },
      { accountCode: '2020', debit: 0, credit: 300 },
    ]);
  });

  it('uses an existing advance and leaves the remaining cost payable', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'organization-advance',
      advancePayment: 750,
      availableAdvance: 900,
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0 },
      { accountCode: '1250', debit: 0, credit: 750 },
      { accountCode: '2020', debit: 0, credit: 250 },
    ]);
  });

  it('supports a combination of advance, personal money, reimbursement, and payable', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1200,
      paymentMethod: 'advance-and-personal',
      advancePayment: 400,
      officerPayment: 500,
      reimbursement: 100,
      availableAdvance: 400,
    }).lines).toEqual([
      { accountCode: '1700', debit: 1200, credit: 0 },
      { accountCode: '1250', debit: 0, credit: 400 },
      { accountCode: '2050', debit: 0, credit: 500 },
      { accountCode: '2050', debit: 100, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 100 },
      { accountCode: '2020', debit: 0, credit: 300 },
    ]);
  });

  it('records a fully unpaid purchase without zero-value journal lines', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'not-yet-paid',
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0 },
      { accountCode: '2020', debit: 0, credit: 1000 },
    ]);
  });

  it('keeps each supplier payment and reimbursement on its actual posting date', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'officer-personal',
      transactionDate: '2026-01-10',
      officerPayments: [{ date: '2026-01-12', amount: 700 }],
      reimbursements: [
        { date: '2026-01-20', amount: 100 },
        { date: '2026-01-25', amount: 100 },
      ],
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0, date: '2026-01-10' },
      { accountCode: '2050', debit: 0, credit: 700, date: '2026-01-12' },
      { accountCode: '2050', debit: 100, credit: 0, date: '2026-01-20' },
      { accountCode: '1010', debit: 0, credit: 100, date: '2026-01-20' },
      { accountCode: '2050', debit: 100, credit: 0, date: '2026-01-25' },
      { accountCode: '1010', debit: 0, credit: 100, date: '2026-01-25' },
      { accountCode: '2020', debit: 0, credit: 300, date: '2026-01-10' },
    ]);
  });

  it('rejects overpayments, excessive reimbursements, and unavailable advances', () => {
    expect(() => buildMerchandiseAcquisitionPosting({ totalCost: 100, paymentMethod: 'organization-funds', organizationPayment: 101 })).toThrow(/cannot exceed/i);
    expect(() => buildMerchandiseAcquisitionPosting({ totalCost: 100, paymentMethod: 'officer-personal', officerPayment: 50, reimbursement: 51 })).toThrow(/reimbursement/i);
    expect(() => buildMerchandiseAcquisitionPosting({ totalCost: 100, paymentMethod: 'organization-advance', advancePayment: 50, availableAdvance: 49 })).toThrow(/advance used/i);
  });
});
