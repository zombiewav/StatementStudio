import { describe, expect, it } from 'vitest';
import { buildReceivableCollectionPosting, RECEIVABLE_COLLECTION_KINDS, receivableCollectionKind, receivableCollectionLimitMessage } from './receivableCollections';
import { categorizeTransactionRule } from './transactionCategories';

const kind = (code: string) => receivableCollectionKind('1010', code)!;

describe('receivable collections in Merchandise Transactions', () => {
  it('recognises the collection types (three in Merchandise, plus the Miscellaneous remittance) by their accounts', () => {
    expect(RECEIVABLE_COLLECTION_KINDS.map(item => item.title)).toEqual([
      'Collection of Refund from Supplier for Excess Payment', 'Collection of Receivables from Officers - Merchandise', 'Collection of Unpaid Sold Merchandise', 'Remittance of Collections by Officers',
    ]);
    expect(receivableCollectionKind('1010', '1320')?.accountLabel).toBe('Due from Officers');
    expect(receivableCollectionKind('1010', '1200')?.accountLabel).toBe('Accounts Receivable - Merchandise');
    expect(receivableCollectionKind('1010', '4070')).toBeUndefined();
    expect(receivableCollectionKind('1015', '1200')).toBeUndefined();
  });

  it('posts Dr Cash on Hand / Cr the receivable', () => {
    expect(buildReceivableCollectionPosting(kind('1320'), 150, '2026-10-15', 400).map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1010', 150, 0], ['1320', 0, 150]]);
    expect(buildReceivableCollectionPosting(kind('1200'), 300, '', 300).map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1010', 300, 0], ['1200', 0, 300]]);
  });

  it('never lets a collection exceed the receivable balance, and needs a positive amount', () => {
    expect(() => buildReceivableCollectionPosting(kind('1200'), 300.01, '', 300)).toThrow('Accounts Receivable - Merchandise');
    expect(() => buildReceivableCollectionPosting(kind('1320'), 1, '', 0)).toThrow('Due from Officers');
    expect(() => buildReceivableCollectionPosting(kind('1320'), 0, '', 100)).toThrow('greater than zero');
    expect(receivableCollectionLimitMessage(kind('1320'), 80, value => `P${value}`)).toBe('Collection cannot exceed the outstanding Due from Officers balance of P80.');
  });

  it('files both new types under Merchandise Transactions', () => {
    expect(categorizeTransactionRule({ debitAccountCode: '1010', creditAccountCode: '1320', description: 'Collection of Receivables from Officers - Merchandise' })).toBe('merchandise');
    expect(categorizeTransactionRule({ debitAccountCode: '1010', creditAccountCode: '1200', description: 'Collection of Unpaid Sold Merchandise' })).toBe('merchandise');
  });
});
