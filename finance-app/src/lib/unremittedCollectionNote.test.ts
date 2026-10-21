import { describe, expect, it } from 'vitest';
import { showsUnremittedCollectionNote } from './unremittedCollectionNote';
import { DEFAULT_RULES } from '../context/FinanceContext';
import { categorizeTransactionRule } from './transactionCategories';
import { receivableCollectionKind } from './receivableCollections';

describe('Unremitted collections reminder placement', () => {
  it('shows on every Membership Fees type except the collection status one', () => {
    expect(showsUnremittedCollectionNote('membership-fees', 'Collection of Unpaid Membership Fees from Previous Period')).toBe(true);
    expect(showsUnremittedCollectionNote('membership-fees', 'Excess Membership Fee Collection - Status')).toBe(false);
  });
  it('shows on every Miscellaneous type except Unremitted Collections by an Officer itself', () => {
    expect(showsUnremittedCollectionNote('other', 'Unremitted Collections by an Officer')).toBe(false);
    expect(showsUnremittedCollectionNote('other', 'Other Income')).toBe(true);
    expect(showsUnremittedCollectionNote('other', 'Remittance of Collections by Officers')).toBe(true);
  });
  it('shows on only the three merchandise collection types', () => {
    ['Collection of Refund from Supplier for Excess Payment', 'Collection of Receivables from Officers - Merchandise', 'Collection of Unpaid Sold Merchandise']
      .forEach(type => expect(showsUnremittedCollectionNote('merchandise', type)).toBe(true));
    expect(showsUnremittedCollectionNote('merchandise', 'Acquisition of Merchandise for Sale - Goods Received and On Hand')).toBe(false);
    expect(showsUnremittedCollectionNote('payables', 'Anything')).toBe(false);
  });
});

describe('Miscellaneous officer types', () => {
  it('lists both under Miscellaneous with the right accounts', () => {
    const unremitted = DEFAULT_RULES.find(rule => rule.description === 'Unremitted Collections by an Officer')!;
    const remittance = DEFAULT_RULES.find(rule => rule.description === 'Remittance of Collections by Officers')!;
    expect(unremitted).toMatchObject({ debitAccountCode: '1320', creditAccountCode: '1010' });
    expect(remittance).toMatchObject({ debitAccountCode: '1010', creditAccountCode: '1320' });
    expect(categorizeTransactionRule(unremitted)).toBe('other');
    expect(categorizeTransactionRule(remittance)).toBe('other');
  });
  it('limits the remittance by the Due from Officers balance, and keeps the merchandise kind for its own type', () => {
    expect(receivableCollectionKind('1010', '1320', 'Remittance of Collections by Officers')?.title).toBe('Remittance of Collections by Officers');
    expect(receivableCollectionKind('1010', '1320', 'Collection of Receivables from Officers - Merchandise')?.title).toBe('Collection of Receivables from Officers - Merchandise');
  });
});
