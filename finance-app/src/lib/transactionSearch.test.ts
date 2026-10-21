import { describe, expect, it } from 'vitest';
import { searchTransactionTypes, TransactionSearchEntry } from './transactionSearch';

const entries: TransactionSearchEntry[] = [
  { label: 'Collection of Activity Fees Receivable', categoryId: 'activity-fees', categoryLabel: 'Activity Fees', activityFeeChoice: 'receivable' },
  { label: 'Collection of Activity / Event Fees', categoryId: 'activity-fees', categoryLabel: 'Activity Fees', activityFeeChoice: 'activity-fees' },
  { label: 'Collection of Refund from Supplier for Excess Payment', categoryId: 'merchandise', categoryLabel: 'Merchandise Transactions', typeName: 'Collection of Refund from Supplier for Excess Payment' },
  { label: 'Purchase of Pins', categoryId: 'ppe-transactions', categoryLabel: 'PPE Transactions', typeName: 'Purchase of Pins' },
];

describe('transaction type search', () => {
  it('finds nothing for a blank query', () => {
    expect(searchTransactionTypes('  ', entries)).toEqual([]);
  });

  it('finds dropdown choices from any category, case-insensitively', () => {
    expect(searchTransactionTypes('RECEIVABLE', entries).map(entry => entry.label)).toEqual(['Collection of Activity Fees Receivable']);
    expect(searchTransactionTypes('collection', entries).map(entry => entry.categoryId)).toEqual(['activity-fees', 'activity-fees', 'merchandise']);
  });

  it('ranks names that start with the query first, and also matches the category name', () => {
    expect(searchTransactionTypes('ppe', entries).map(entry => entry.label)).toEqual(['Purchase of Pins']);
    expect(searchTransactionTypes('supplier', entries)[0].typeName).toBe('Collection of Refund from Supplier for Excess Payment');
  });
});
