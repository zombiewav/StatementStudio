import { describe, expect, it } from 'vitest';
import { buildInventoryBatchBalances, buildMerchandiseBatchBalances, buildMerchandiseSalePosting } from './merchandiseSale';
import { JournalEntry } from '../types';

describe('merchandise sale posting', () => {
  it('records a fully uncollected sale as accounts receivable plus cost of sales', () => {
    expect(buildMerchandiseSalePosting({ totalSales: 1000, inventoryCost: 600, collectionMethod: 'not-yet-collected' }).lines).toEqual([
      { accountCode: '1200', debit: 1000, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      { accountCode: '5240', debit: 600, credit: 0 },
      { accountCode: '1700', debit: 0, credit: 600 },
    ]);
  });

  it('splits direct collections and the amount still receivable', () => {
    expect(buildMerchandiseSalePosting({ totalSales: 1000, inventoryCost: 600, collectionMethod: 'organization-direct', totalCollected: 700 }).lines).toEqual([
      { accountCode: '1010', debit: 700, credit: 0 },
      { accountCode: '1200', debit: 300, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      { accountCode: '5240', debit: 600, credit: 0 },
      { accountCode: '1700', debit: 0, credit: 600 },
    ]);
  });

  it('keeps separate direct Cash collections on their entered ledger dates', () => {
    expect(buildMerchandiseSalePosting({
      totalSales: 2000,
      inventoryCost: 900,
      collectionMethod: 'organization-direct',
      transactionDate: '2026-01-05',
      collections: [
        { date: '2026-01-10', amount: 1000 },
        { date: '2026-01-20', amount: 600 },
      ],
    }).lines).toEqual([
      { accountCode: '1010', debit: 1000, credit: 0, date: '2026-01-10' },
      { accountCode: '1010', debit: 600, credit: 0, date: '2026-01-20' },
      { accountCode: '1200', debit: 400, credit: 0, date: '2026-01-05' },
      { accountCode: '4070', debit: 0, credit: 2000, date: '2026-01-05' },
      { accountCode: '5240', debit: 900, credit: 0, date: '2026-01-05' },
      { accountCode: '1700', debit: 0, credit: 900, date: '2026-01-05' },
    ]);
  });

  it('splits officer collections into cash remitted, due from officer, and customer receivable', () => {
    expect(buildMerchandiseSalePosting({ totalSales: 2000, inventoryCost: 900, collectionMethod: 'officer-to-remit', totalCollected: 1600, totalRemitted: 1000 })).toMatchObject({
      accountsReceivable: 400,
      dueFromOfficer: 600,
      cashCollected: 1000,
      lines: [
        { accountCode: '1320', debit: 1600, credit: 0 },
        { accountCode: '1010', debit: 1000, credit: 0 },
        { accountCode: '1320', debit: 0, credit: 1000 },
        { accountCode: '1200', debit: 400, credit: 0 },
        { accountCode: '4070', debit: 0, credit: 2000 },
        { accountCode: '5240', debit: 900, credit: 0 },
        { accountCode: '1700', debit: 0, credit: 900 },
      ],
    });
  });

  it('posts each collection and remittance to the date entered by the user', () => {
    expect(buildMerchandiseSalePosting({
      totalSales: 2000,
      inventoryCost: 900,
      collectionMethod: 'officer-to-remit',
      transactionDate: '2026-01-05',
      collections: [
        { date: '2026-01-10', amount: 600 },
        { date: '2026-01-15', amount: 1000 },
      ],
      remittances: [{ date: '2026-01-20', amount: 1000 }],
    }).lines).toEqual([
      { accountCode: '1320', debit: 600, credit: 0, date: '2026-01-10' },
      { accountCode: '1320', debit: 1000, credit: 0, date: '2026-01-15' },
      { accountCode: '1010', debit: 1000, credit: 0, date: '2026-01-20' },
      { accountCode: '1320', debit: 0, credit: 1000, date: '2026-01-20' },
      { accountCode: '1200', debit: 400, credit: 0, date: '2026-01-05' },
      { accountCode: '4070', debit: 0, credit: 2000, date: '2026-01-05' },
      { accountCode: '5240', debit: 900, credit: 0, date: '2026-01-05' },
      { accountCode: '1700', debit: 0, credit: 900, date: '2026-01-05' },
    ]);
  });

  it('rejects collections above sales and remittances above officer collections', () => {
    expect(() => buildMerchandiseSalePosting({ totalSales: 100, inventoryCost: 50, collectionMethod: 'officer-to-remit', totalCollected: 80, totalRemitted: 81 })).toThrow(/cannot exceed what the officer collected/i);
  });
});

describe('merchandise sale with buyer downpayments', () => {
  const sale = (extra: Record<string, unknown>) => buildMerchandiseSalePosting({ totalSales: 1000, inventoryCost: 600, collectionMethod: 'not-yet-collected', ...extra } as never);
  const cost = [{ accountCode: '5240', debit: 600, credit: 0 }, { accountCode: '1700', debit: 0, credit: 600 }];

  it('receivable is the sales less the downpayment, and the downpayment leaves Unearned Merchandise Revenue', () => {
    expect(sale({ buyerDownpayment: 300 }).lines).toEqual([
      { accountCode: '1200', debit: 700, credit: 0 },
      { accountCode: '2140', debit: 300, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      ...cost,
    ]);
  });

  it('collections cover the rest, leaving no receivable and no refund', () => {
    const posting = sale({ buyerDownpayment: 300, collectionMethod: 'organization-direct', totalCollected: 700 });
    expect(posting.lines).toEqual([
      { accountCode: '1010', debit: 700, credit: 0 },
      { accountCode: '2140', debit: 300, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      ...cost,
    ]);
    expect(posting).toMatchObject({ accountsReceivable: 0, refundLiability: 0 });
  });

  it('records collections beyond the total sales as Refund Liability - Merchandise', () => {
    const posting = sale({ buyerDownpayment: 300, collectionMethod: 'organization-direct', totalCollected: 900 });
    expect(posting.lines).toEqual([
      { accountCode: '1010', debit: 900, credit: 0 },
      { accountCode: '2140', debit: 300, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      { accountCode: '2150', debit: 0, credit: 200 },
      ...cost,
    ]);
    expect(posting.refundLiability).toBe(200);
  });

  it('sends downpayments larger than the sale to the refund liability even when nothing else was collected', () => {
    const posting = sale({ buyerDownpayment: 1200 });
    expect(posting.lines).toEqual([
      { accountCode: '2140', debit: 1200, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      { accountCode: '2150', debit: 0, credit: 200 },
      ...cost,
    ]);
    expect(posting.accountsReceivable).toBe(0);
  });

  it('keeps the officer-collection split with downpayments applied', () => {
    const posting = sale({ buyerDownpayment: 300, collectionMethod: 'officer-to-remit', totalCollected: 500, totalRemitted: 200 });
    expect(posting.lines).toEqual([
      { accountCode: '1320', debit: 500, credit: 0 },
      { accountCode: '1010', debit: 200, credit: 0 },
      { accountCode: '1320', debit: 0, credit: 200 },
      { accountCode: '1200', debit: 200, credit: 0 },
      { accountCode: '2140', debit: 300, credit: 0 },
      { accountCode: '4070', debit: 0, credit: 1000 },
      ...cost,
    ]);
    expect(posting).toMatchObject({ accountsReceivable: 200, dueFromOfficer: 300, cashCollected: 200 });
  });
});

describe('merchandise batch balances', () => {
  const purchase: JournalEntry = {
    id: 'purchase-1', reference: 'JE-0001', date: '2026-01-01', description: 'Lanyards', project: 'General',
    lines: [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
    transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Lanyard', merchandiseQuantity: 100 },
  };
  const sale: JournalEntry = {
    id: 'sale-1', reference: 'JE-0002', date: '2026-02-01', description: 'Sale', project: 'General',
    lines: [{ accountCode: '5240', debit: 200, credit: 0 }, { accountCode: '1700', debit: 0, credit: 200 }],
    transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseBatchEntryId: 'purchase-1', merchandiseQuantitySold: 20 },
  };

  it('keeps purchase batches available until all units are sold', () => {
    expect(buildMerchandiseBatchBalances([purchase, sale])).toEqual([expect.objectContaining({ item: 'Lanyard', purchasedQuantity: 100, soldQuantity: 20, remainingQuantity: 80, referenceUnitCost: 10, costOfSales: 200, netInventoryBalance: 800 })]);
  });
});

describe('inventory batches for the sale form', () => {
  const acquisition = (id: string, extra: Record<string, unknown>): JournalEntry => ({
    id, reference: id.toUpperCase(), date: '2026-10-01', description: 'Acquisition', project: 'General',
    lines: [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
    transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', ...extra } as never,
  });
  const sale = (batchId: string, cost: number): JournalEntry => ({
    id: `sale-${batchId}-${cost}`, reference: 'SALE', date: '2026-10-10', description: 'Sale', project: 'General',
    lines: [{ accountCode: '5240', debit: cost, credit: 0 }, { accountCode: '1700', debit: 0, credit: cost }],
    transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseBatchEntryId: batchId, inventoryCost: cost } as never,
  });

  it('offers a batch even when no quantity was entered, which the unit-based list cannot', () => {
    const entries = [acquisition('acq', {})];
    expect(buildMerchandiseBatchBalances(entries)).toEqual([]);
    expect(buildInventoryBatchBalances(entries)).toMatchObject([{ entryId: 'acq', item: 'Pins', batch: 'Batch 1', acquisitionCost: 1000, netInventoryBalance: 1000 }]);
  });

  it('keeps a batch available while inventory cost remains and drops it once fully released', () => {
    const entries = [acquisition('acq', { merchandiseQuantity: 10 }), sale('acq', 400)];
    expect(buildInventoryBatchBalances(entries)[0]).toMatchObject({ costOfSales: 400, netInventoryBalance: 600 });
    expect(buildInventoryBatchBalances([...entries, sale('acq', 600)])).toEqual([]);
    expect(buildInventoryBatchBalances([...entries, sale('acq', 600)], true)[0].netInventoryBalance).toBe(0);
  });

  it('ignores downpayments, payment batches and customer orders that carry the same item and batch', () => {
    const downpayment: JournalEntry = { ...acquisition('dp', { merchandiseBuyerDownpayment: true }), lines: [{ accountCode: '1010', debit: 300, credit: 0 }, { accountCode: '2140', debit: 0, credit: 300 }] };
    const supplierDownpayment: JournalEntry = { ...acquisition('sdp', {}), lines: [{ accountCode: '1270', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }] };
    const order = acquisition('order', { customerOrder: true });
    expect(buildInventoryBatchBalances([downpayment, supplierDownpayment, order])).toEqual([]);
  });

  it('ignores reversed acquisitions', () => {
    expect(buildInventoryBatchBalances([{ ...acquisition('acq', {}), reversedByEntryId: 'rev' }])).toEqual([]);
  });
});
