import { describe, expect, it } from 'vitest';
import { aggregateAvailableBuyerDownpayments, buildBuyerDownpaymentPosting, buyerDownpaymentAmountChangeBlock, buyerDownpaymentLinkBlock, buyerDownpaymentTotal } from './buyerDownpayments';
import { JournalEntry } from '../types';

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

const entry = (id: string, amount: number, extra: Partial<JournalEntry> = {}, details: Record<string, unknown> = {}): JournalEntry => ({
  id, reference: id.toUpperCase(), date: '2026-10-05', description: id, project: 'General Fund Operations',
  lines: [{ accountCode: '1010', debit: amount, credit: 0 }, { accountCode: '2140', debit: 0, credit: amount }],
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseBuyerDownpayment: true, merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', ...details } as never,
  ...extra,
});
const saleEntry = (ids: string[]): JournalEntry => ({
  id: 'sale', reference: 'SALE', date: '2026-10-20', description: 'sale', project: 'General Fund Operations', lines: [],
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseBuyerDownpaymentEntryIds: ids } as never,
});

describe('aggregateAvailableBuyerDownpayments', () => {
  it('adds every unapplied downpayment for the same item and batch, ignoring letter case', () => {
    const entries = [entry('dp1', 500), entry('dp2', 250, {}, { merchandiseItem: 'PINS', merchandiseBatch: 'batch 1' }), entry('other', 900, {}, { merchandiseBatch: 'Batch 2' })];
    expect(aggregateAvailableBuyerDownpayments(entries, 'Pins', 'Batch 1')).toEqual({ entryIds: ['dp1', 'dp2'], amount: 750, draftCount: 0 });
  });

  it('leaves out downpayments already applied by an active sale, reversed ones, and non-downpayment entries', () => {
    const entries = [entry('dp1', 500), entry('dp2', 250, { reversedByEntryId: 'x' }), entry('dp3', 100, {}, { merchandiseBuyerDownpayment: false }), saleEntry(['dp1'])];
    expect(aggregateAvailableBuyerDownpayments(entries, 'Pins', 'Batch 1').entryIds).toEqual([]);
    expect(aggregateAvailableBuyerDownpayments([entry('dp1', 500), { ...saleEntry(['dp1']), reversedByEntryId: 'rev' }], 'Pins', 'Batch 1').entryIds).toEqual(['dp1']);
  });

  it('counts saved drafts and says how many there are', () => {
    expect(aggregateAvailableBuyerDownpayments([entry('dp1', 500, { isDraft: true })], 'Pins', 'Batch 1')).toEqual({ entryIds: ['dp1'], amount: 500, draftCount: 1 });
  });

  it('needs both an item and a batch', () => {
    expect(aggregateAvailableBuyerDownpayments([entry('dp1', 500)], '', 'Batch 1').amount).toBe(0);
    expect(aggregateAvailableBuyerDownpayments([entry('dp1', 500)], 'Pins', ' ').amount).toBe(0);
  });
});

describe('applied buyer downpayment guards', () => {
  const downpayment = entry('dp1', 500);
  it('blocks deleting, reversing or changing the amount of a downpayment a sale applied', () => {
    const entries = [downpayment, saleEntry(['dp1'])];
    expect(buyerDownpaymentLinkBlock(downpayment, entries)).toContain('already applied to SALE');
    expect(buyerDownpaymentAmountChangeBlock(downpayment, entries, [{ accountCode: '2140', debit: 0, credit: 450 }])).toContain('amount cannot change');
    expect(buyerDownpaymentAmountChangeBlock(downpayment, entries, downpayment.lines)).toBeUndefined();
  });

  it('allows changes while no sale applied it', () => {
    expect(buyerDownpaymentLinkBlock(downpayment, [downpayment])).toBeUndefined();
    expect(buyerDownpaymentAmountChangeBlock(downpayment, [downpayment], [{ accountCode: '2140', debit: 0, credit: 450 }])).toBeUndefined();
  });
});
