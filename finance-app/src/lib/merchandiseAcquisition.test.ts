import { describe, expect, it } from 'vitest';
import { acquisitionLinkedToDownpayment, aggregateAvailableMerchandisePrepayments, downpaymentAmountChangeBlock, downpaymentLinkBlock, buildMerchandiseAcquisitionPosting, buildMerchandisePrepaymentPosting, buildSupplierReceivableCollectionPosting, resolveMerchandisePurchaseDate, splitMerchandiseAcquisitionPosting } from './merchandiseAcquisition';

describe('optional merchandise purchase date', () => {
  it('keeps an explicit receipt date even when payments are later', () => {
    expect(resolveMerchandisePurchaseDate('2026-02-10', [{ date: '2026-02-15', amount: 100 }], '2026-10-11')).toBe('2026-02-10');
  });

  it('uses the earliest entered positive payment and ignores empty or zero-value rows', () => {
    expect(resolveMerchandisePurchaseDate('', [
      { date: '2026-02-20', amount: '100' }, { date: '2026-02-10', amount: 200 },
      { date: '2026-01-01', amount: '' }, { date: '2026-01-02', amount: 0 }, { date: '', amount: 50 },
    ], '2026-10-11')).toBe('2026-02-10');
  });

  it('posts a blank purchase date as balanced dated batches using the earliest payment', () => {
    const organizationPayments = [{ date: '2026-02-15', amount: 250 }, { date: '2026-02-10', amount: 300 }];
    const purchaseDate = resolveMerchandisePurchaseDate('', organizationPayments, '2026-10-11');
    const posting = buildMerchandiseAcquisitionPosting({
      totalCost: 1000, paymentMethod: 'organization-funds', transactionDate: purchaseDate, organizationPayments,
    });
    const batches = splitMerchandiseAcquisitionPosting(posting, purchaseDate);
    expect(batches.map(batch => batch.date)).toEqual(['2026-02-10', '2026-02-15']);
    expect(batches[0].lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0, date: '2026-02-10' },
      { accountCode: '1010', debit: 0, credit: 300, date: '2026-02-10' },
      { accountCode: '2020', debit: 0, credit: 700, date: '2026-02-10' },
    ]);
    expect(batches[1].lines).toEqual([
      { accountCode: '2020', debit: 250, credit: 0, date: '2026-02-15' },
      { accountCode: '1010', debit: 0, credit: 250, date: '2026-02-15' },
    ]);
    expect(posting.merchandisePayable).toBe(450);
  });

  it('uses the supplied local date for an unpaid purchase with no dated payments', () => {
    const purchaseDate = resolveMerchandisePurchaseDate('', [], '2026-10-11');
    const posting = buildMerchandiseAcquisitionPosting({ totalCost: 1000, paymentMethod: 'not-yet-paid', transactionDate: purchaseDate });
    expect(purchaseDate).toBe('2026-10-11');
    expect(splitMerchandiseAcquisitionPosting(posting, purchaseDate)).toEqual([
      { date: '2026-10-11', lines: [
        { accountCode: '1700', debit: 1000, credit: 0, date: '2026-10-11' },
        { accountCode: '2020', debit: 0, credit: 1000, date: '2026-10-11' },
      ] },
    ]);
  });
});

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
      { accountCode: '2020', debit: 0, credit: 1000, date: '2026-01-10' },
      { accountCode: '2020', debit: 700, credit: 0, date: '2026-01-12' },
      { accountCode: '2050', debit: 0, credit: 700, date: '2026-01-12' },
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
      { accountCode: '2020', debit: 0, credit: 500, date: '2026-02-10' },
      { accountCode: '2020', debit: 250, credit: 0, date: '2026-02-15' },
      { accountCode: '1010', debit: 0, credit: 250, date: '2026-02-15' },
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
      { accountCode: '2020', debit: 0, credit: 1000, date: '2026-09-28' },
      { accountCode: '2020', debit: 200, credit: 0, date: '2026-09-29' },
      { accountCode: '1010', debit: 0, credit: 200, date: '2026-09-29' },
    ]);
  });

  it('keeps each later dated payment batch together, including mixed funding sources', () => {
    expect(buildMerchandiseAcquisitionPosting({
      totalCost: 1000,
      paymentMethod: 'advance-and-personal',
      transactionDate: '2026-02-10',
      organizationPayments: [{ date: '2026-02-10', amount: 200 }, { date: '2026-02-15', amount: 150 }],
      advancePayments: [{ date: '2026-02-15', amount: 100 }],
      officerPayments: [{ date: '2026-02-15', amount: 50 }],
      availableCash: 350,
      availableAdvance: 100,
    }).lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0, date: '2026-02-10' },
      { accountCode: '1010', debit: 0, credit: 200, date: '2026-02-10' },
      { accountCode: '2020', debit: 0, credit: 800, date: '2026-02-10' },
      { accountCode: '2020', debit: 300, credit: 0, date: '2026-02-15' },
      { accountCode: '1010', debit: 0, credit: 150, date: '2026-02-15' },
      { accountCode: '1250', debit: 0, credit: 100, date: '2026-02-15' },
      { accountCode: '2050', debit: 0, credit: 50, date: '2026-02-15' },
    ]);
  });

  it('creates one balanced journal-entry batch for the purchase and each later payment date', () => {
    const posting = buildMerchandiseAcquisitionPosting({
      totalCost: 1000, paymentMethod: 'organization-funds', transactionDate: '2026-02-10',
      organizationPayments: [{ date: '2026-02-10', amount: 300 }, { date: '2026-02-15', amount: 250 }, { date: '2026-02-20', amount: 450 }],
    });
    expect(splitMerchandiseAcquisitionPosting(posting, '2026-02-10')).toEqual([
      { date: '2026-02-10', lines: [{ accountCode: '1700', debit: 1000, credit: 0, date: '2026-02-10' }, { accountCode: '1010', debit: 0, credit: 300, date: '2026-02-10' }, { accountCode: '2020', debit: 0, credit: 700, date: '2026-02-10' }] },
      { date: '2026-02-15', lines: [{ accountCode: '2020', debit: 250, credit: 0, date: '2026-02-15' }, { accountCode: '1010', debit: 0, credit: 250, date: '2026-02-15' }] },
      { date: '2026-02-20', lines: [{ accountCode: '2020', debit: 450, credit: 0, date: '2026-02-20' }, { accountCode: '1010', debit: 0, credit: 450, date: '2026-02-20' }] },
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
    expect(result).toEqual({ entryIds: ['dp-1', 'dp-2'], amount: 250, draftCount: 0 });
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

describe('payments entered as "on a later date"', () => {
  const base = { totalCost: 1000, paymentMethod: 'organization-funds' as const, transactionDate: '2026-03-01', availableCash: 5000 };

  it('keeps a later payment as its own batch even when its date is blank', () => {
    const posting = buildMerchandiseAcquisitionPosting({
      ...base,
      organizationPayments: [{ date: '', amount: 400 }, { date: '', amount: 300, later: true }],
    });
    expect(posting.merchandisePayable).toBe(300);
    const batches = splitMerchandiseAcquisitionPosting(posting, '2026-03-01');
    expect(batches).toHaveLength(2);
    expect(batches[0].lines).toEqual([
      { accountCode: '1700', debit: 1000, credit: 0, date: '2026-03-01' },
      { accountCode: '1010', debit: 0, credit: 400, date: '2026-03-01' },
      { accountCode: '2020', debit: 0, credit: 600, date: '2026-03-01' },
    ]);
    expect(batches[1].lines).toEqual([
      { accountCode: '2020', debit: 300, credit: 0, date: '2026-03-01' },
      { accountCode: '1010', debit: 0, credit: 300, date: '2026-03-01' },
    ]);
  });

  it('sends the part of a later payment beyond the payable to Receivable from Supplier', () => {
    const posting = buildMerchandiseAcquisitionPosting({
      ...base,
      organizationPayments: [{ date: '', amount: 800 }, { date: '2026-03-09', amount: 500, later: true }],
    });
    expect(posting.merchandisePayable).toBe(0);
    expect(posting.supplierReceivable).toBe(300);
    const batches = splitMerchandiseAcquisitionPosting(posting, '2026-03-01');
    expect(batches.map(batch => batch.date)).toEqual(['2026-03-01', '2026-03-09']);
    expect(batches[1].lines).toEqual([
      { accountCode: '2020', debit: 200, credit: 0, date: '2026-03-09' },
      { accountCode: '1360', debit: 300, credit: 0, date: '2026-03-09' },
      { accountCode: '1010', debit: 0, credit: 500, date: '2026-03-09' },
    ]);
  });

  it('books each later batch separately when several share one date', () => {
    const posting = buildMerchandiseAcquisitionPosting({
      ...base,
      organizationPayments: [{ date: '', amount: 200 }, { date: '', amount: 100, later: true }, { date: '', amount: 150, later: true }],
    });
    expect(splitMerchandiseAcquisitionPosting(posting, '2026-03-01')).toHaveLength(2);
    expect(posting.merchandisePayable).toBe(550);
  });
});

describe('draft downpayments and their links', () => {
  const entry = (id: string, extra: Record<string, unknown> = {}, lines = [{ accountCode: '1270', debit: 100, credit: 0 }], details: Record<string, unknown> = {}) => ({
    id, reference: id.toUpperCase(), date: '2026-10-01', description: 'Downpayment', project: 'General Fund Operations',
    transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Lanyard', merchandiseBatch: 'Lanyard Batch 1', ...details },
    lines, ...extra,
  }) as unknown as import('../types').JournalEntry;

  it('counts saved drafts together with posted downpayments', () => {
    const result = aggregateAvailableMerchandisePrepayments([
      entry('dp-1', { isDraft: true }, [{ accountCode: '1270', debit: 1000, credit: 0 }]),
      entry('dp-2', { isDraft: true }, [{ accountCode: '1270', debit: 200, credit: 0 }]),
      entry('dp-3', {}, [{ accountCode: '1270', debit: 50, credit: 0 }]),
    ], 'Lanyard', 'Lanyard Batch 1');
    expect(result).toEqual({ entryIds: ['dp-1', 'dp-2', 'dp-3'], amount: 1250, draftCount: 2 });
  });

  it('matches the item and batch without caring about case or spaces', () => {
    expect(aggregateAvailableMerchandisePrepayments([entry('dp-1')], ' lanyard ', 'lanyard batch 1').entryIds).toEqual(['dp-1']);
  });

  it('ignores the acquisition of the same batch and reversed downpayments', () => {
    const result = aggregateAvailableMerchandisePrepayments([
      entry('dp-1'),
      entry('acq', {}, [{ accountCode: '1700', debit: 500, credit: 0 }, { accountCode: '1270', debit: 0, credit: 100 }], { merchandisePrepaymentEntryIds: ['dp-used'] }),
      entry('dp-rev', { reversedByEntryId: 'x' }),
    ], 'Lanyard', 'Lanyard Batch 1');
    expect(result).toEqual({ entryIds: ['dp-1'], amount: 100, draftCount: 0 });
  });

  it('frees a downpayment again once the acquisition using it is reversed', () => {
    const downpayment = entry('dp-1');
    const acquisition = entry('acq', {}, [{ accountCode: '1700', debit: 500, credit: 0 }], { merchandisePrepaymentEntryIds: ['dp-1'] });
    expect(aggregateAvailableMerchandisePrepayments([downpayment, acquisition], 'Lanyard', 'Lanyard Batch 1').entryIds).toEqual([]);
    const reversed = { ...acquisition, reversedByEntryId: 'rev' };
    expect(aggregateAvailableMerchandisePrepayments([downpayment, reversed], 'Lanyard', 'Lanyard Batch 1').entryIds).toEqual(['dp-1']);
  });

  it('blocks deleting or changing the amount of a downpayment that an acquisition uses', () => {
    const downpayment = entry('dp-1', { isDraft: true });
    const acquisition = entry('acq', {}, [{ accountCode: '1700', debit: 500, credit: 0 }], { merchandisePrepaymentEntryIds: ['dp-1'] });
    const entries = [downpayment, acquisition];
    expect(acquisitionLinkedToDownpayment(downpayment, entries)?.id).toBe('acq');
    expect(downpaymentLinkBlock(downpayment, entries)).toContain('already linked to ACQ');
    expect(downpaymentAmountChangeBlock(downpayment, entries, [{ accountCode: '1270', debit: 300, credit: 0 }])).toContain('amount cannot change');
    expect(downpaymentAmountChangeBlock(downpayment, entries, [{ accountCode: '1270', debit: 100, credit: 0 }])).toBeUndefined();
  });

  it('allows changes when nothing uses the downpayment', () => {
    const downpayment = entry('dp-1');
    expect(downpaymentLinkBlock(downpayment, [downpayment])).toBeUndefined();
    expect(downpaymentAmountChangeBlock(downpayment, [downpayment], [{ accountCode: '1270', debit: 999, credit: 0 }])).toBeUndefined();
  });
});
