import { describe, expect, it } from 'vitest';
import { aggregateAvailableMerchandisePrepayments, buildMerchandiseAcquisitionPosting, buildMerchandisePrepaymentPosting, buildSupplierReceivableCollectionPosting } from './merchandiseAcquisition';

describe('merchandise acquisition posting', () => {
  it('records an organization payment and leaves the unpaid cost in Accounts Payable - Merchandise', () => {
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
      prepaymentApplied: 0,
      supplierReceivable: 0,
    });
  });

  it('records officer payments as Due to Officers and leaves reimbursement separate', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'officer-personal',
      officerPayment: 700,
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0 },
      { accountCode: '2050', debit: 0, credit: 700 },
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

  it('supports a combination of organization funds, officer money, and officer advance', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1200,
      paymentMethod: 'advance-and-personal',
      organizationPayment: 200,
      advancePayment: 400,
      officerPayment: 500,
      availableCash: 200,
      availableAdvance: 400,
    }).lines).toEqual([
      { accountCode: '1700', debit: 1200, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 200 },
      { accountCode: '1250', debit: 0, credit: 400 },
      { accountCode: '2050', debit: 0, credit: 500 },
      { accountCode: '2020', debit: 0, credit: 100 },
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

  it('keeps each supplier payment on its actual posting date and reimbursement separate', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'officer-personal',
      transactionDate: '2026-01-10',
      officerPayments: [{ date: '2026-01-12', amount: 700 }],
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0, date: '2026-01-10' },
      { accountCode: '2020', debit: 700, credit: 0, date: '2026-01-12' },
      { accountCode: '2050', debit: 0, credit: 700, date: '2026-01-12' },
      { accountCode: '2020', debit: 0, credit: 1000, date: '2026-01-10' },
    ]);
  });

  it('applies a separately recorded supplier prepayment and keeps every posting date balanced', () => {
    const posting = buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'organization-funds',
      transactionDate: '2026-02-10',
      prepaymentAmount: 200,
      organizationPayments: [
        { date: '2026-02-10', amount: 300 },
        { date: '2026-02-15', amount: 250 },
      ],
    });

    expect(posting.lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0, date: '2026-02-10' },
      { accountCode: '1270', debit: 0, credit: 200, date: '2026-02-10' },
      { accountCode: '1010', debit: 0, credit: 300, date: '2026-02-10' },
      { accountCode: '2020', debit: 250, credit: 0, date: '2026-02-15' },
      { accountCode: '1010', debit: 0, credit: 250, date: '2026-02-15' },
      { accountCode: '2020', debit: 0, credit: 500, date: '2026-02-10' },
    ]);
    expect(posting.merchandisePayable).toBe(250);
    expect(posting.prepaymentApplied).toBe(200);
  });

  it('combines payments with the same date into one line per account', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 2000,
      paymentMethod: 'organization-funds',
      transactionDate: '2026-09-28',
      organizationPayments: [
        { date: '2026-09-28', amount: 500 },
        { date: '2026-09-28', amount: 500 },
        { date: '2026-09-29', amount: 200 },
      ],
    }).lines).toEqual([
      { accountCode: '1700', debit: 2000, credit: 0, date: '2026-09-28' },
      { accountCode: '1010', debit: 0, credit: 1000, date: '2026-09-28' },
      { accountCode: '2020', debit: 200, credit: 0, date: '2026-09-29' },
      { accountCode: '1010', debit: 0, credit: 200, date: '2026-09-29' },
      { accountCode: '2020', debit: 0, credit: 1000, date: '2026-09-28' },
    ]);
  });

  it('does not allow a supplier payment date before the goods were received', () => {
    expect(() => buildMerchandiseAcquisitionPosting({
      totalCost: 100,
      paymentMethod: 'organization-funds',
      transactionDate: '2026-02-10',
      organizationPayments: [{ date: '2026-02-09', amount: 50 }],
    })).toThrow(/earlier than the Date Merchandise Was Received/i);
  });

  it('posts merchandise overpayments to Accounts Receivable - Suppliers after settling the merchandise payable', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'organization-funds',
      transactionDate: '2026-02-10',
      prepaymentAmount: 200,
      organizationPayments: [
        { date: '2026-02-10', amount: 300 },
        { date: '2026-02-15', amount: 700 },
      ],
    })).toMatchObject({ merchandisePayable: 0, supplierReceivable: 200 });
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'organization-funds',
      transactionDate: '2026-02-10',
      prepaymentAmount: 200,
      organizationPayments: [
        { date: '2026-02-10', amount: 300 },
        { date: '2026-02-15', amount: 700 },
      ],
    }).lines).toEqual(expect.arrayContaining([
        { accountCode: '2020', debit: 500, credit: 0, date: '2026-02-15' },
        { accountCode: '1360', debit: 200, credit: 0, date: '2026-02-15' },
    ]));
  });

  it('rejects unavailable organization cash and officer advances', () => {
    expect(() => buildMerchandiseAcquisitionPosting({ totalCost: 100, paymentMethod: 'organization-funds', organizationPayment: 50, availableCash: 49 })).toThrow(/cash balance/i);
    expect(() => buildMerchandiseAcquisitionPosting({ totalCost: 100, paymentMethod: 'organization-advance', advancePayment: 50, availableAdvance: 49 })).toThrow(/advance used/i);
  });

  it('collects supplier receivables without exceeding the outstanding balance', () => {
    expect(buildSupplierReceivableCollectionPosting(250, '2026-10-06', 300)).toEqual([
      { accountCode: '1010', debit: 250, credit: 0, date: '2026-10-06' },
      { accountCode: '1360', debit: 0, credit: 250, date: '2026-10-06' },
    ]);
    expect(() => buildSupplierReceivableCollectionPosting(301, '2026-10-06', 300)).toThrow(/cannot exceed/i);
  });

  it('combines every unused downpayment for the same merchandise and batch', () => {
    const base = { reference: 'JE-1', date: '2026-10-01', description: 'Downpayment', project: 'General Fund Operations' };
    const result = aggregateAvailableMerchandisePrepayments([
      { ...base, id: 'dp-1', transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Lanyard', merchandiseBatch: 'Batch 1' }, lines: [{ accountCode: '1270', debit: 100, credit: 0 }] },
      { ...base, id: 'dp-2', transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Lanyard', merchandiseBatch: 'Batch 1' }, lines: [{ accountCode: '1270', debit: 150, credit: 0 }] },
      { ...base, id: 'dp-other', transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Mug', merchandiseBatch: 'Batch 1' }, lines: [{ accountCode: '1270', debit: 500, credit: 0 }] },
      { ...base, id: 'acquisition', transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandisePrepaymentEntryIds: ['dp-used'] }, lines: [{ accountCode: '1700', debit: 50, credit: 0 }] },
      { ...base, id: 'dp-used', transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Lanyard', merchandiseBatch: 'Batch 1' }, lines: [{ accountCode: '1270', debit: 50, credit: 0 }] },
    ], 'Lanyard', 'Batch 1');
    expect(result).toEqual({ entryIds: ['dp-1', 'dp-2'], amount: 250 });
  });
});

describe('merchandise supplier prepayment', () => {
  it('records a combination-funded supplier downpayment', () => {
    expect(buildMerchandisePrepaymentPosting({
      amount: 600, paymentMethod: 'advance-and-personal', transactionDate: '2026-10-04',
      organizationPayments: [{ date: '', amount: 200 }], officerPayments: [{ date: '', amount: 150 }],
      advancePayments: [{ date: '', amount: 250 }], availableCash: 200, availableAdvance: 250,
    })).toEqual([
      { accountCode: '1270', debit: 600, credit: 0, date: '2026-10-04' },
      { accountCode: '1010', debit: 0, credit: 200, date: '2026-10-04' },
      { accountCode: '2050', debit: 0, credit: 150, date: '2026-10-04' },
      { accountCode: '1250', debit: 0, credit: 250, date: '2026-10-04' },
    ]);
  });

  it('requires source totals to equal the downpayment and enforces the officer advance balance', () => {
    expect(() => buildMerchandisePrepaymentPosting({ amount: 100, paymentMethod: 'organization-funds', organizationPayments: [{ date: '', amount: 90 }], availableCash: 100 })).toThrow(/must equal/i);
    expect(() => buildMerchandisePrepaymentPosting({ amount: 100, paymentMethod: 'organization-advance', advancePayments: [{ date: '', amount: 100 }], availableAdvance: 99 })).toThrow(/advance balance/i);
  });
});
