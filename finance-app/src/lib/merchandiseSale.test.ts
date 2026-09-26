import { describe, expect, it } from 'vitest';
import { buildMerchandiseBatchBalances, buildMerchandiseSalePosting } from './merchandiseSale';
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
    expect(() => buildMerchandiseSalePosting({ totalSales: 100, inventoryCost: 50, collectionMethod: 'organization-direct', totalCollected: 101 })).toThrow(/cannot exceed total sales/i);
    expect(() => buildMerchandiseSalePosting({ totalSales: 100, inventoryCost: 50, collectionMethod: 'officer-to-remit', totalCollected: 80, totalRemitted: 81 })).toThrow(/cannot exceed what the officer collected/i);
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
    expect(buildMerchandiseBatchBalances([purchase, sale])).toEqual([expect.objectContaining({ item: 'Lanyard', purchasedQuantity: 100, soldQuantity: 20, remainingQuantity: 80, referenceUnitCost: 10 })]);
  });
});
