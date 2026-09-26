import { describe, expect, it } from 'vitest';
import { categorizeTransactionRule } from './transactionCategories';

const rule = (debitAccountCode: string, creditAccountCode: string, description: string) => ({
  debitAccountCode,
  creditAccountCode,
  description,
});

describe('transaction categories', () => {
  it('groups inventory purchases and merchandise sales together', () => {
    expect(categorizeTransactionRule(rule('1700', '1010', 'Merchandise Inventory Purchase'))).toBe('merchandise');
    expect(categorizeTransactionRule(rule('1010', '4070', 'Merchandise Sales Revenue'))).toBe('merchandise');
  });

  it('groups current and prior-period membership collections together', () => {
    expect(categorizeTransactionRule(rule('1010', '4040', 'Membership Dues Collected'))).toBe('membership-fees');
    expect(categorizeTransactionRule(rule('1010', '1300', "Collection of Previous School Year's Membership Fees Still Receivable"))).toBe('membership-fees');
  });

  it('groups expense and equipment purchases while keeping unrelated entries in other', () => {
    expect(categorizeTransactionRule(rule('5040', '1010', 'Office Supplies Purchase'))).toBe('purchases');
    expect(categorizeTransactionRule(rule('1500', '1010', 'Developer Laptop Purchase'))).toBe('purchases');
    expect(categorizeTransactionRule(rule('1010', '4030', 'Sponsorship - Cash Contribution'))).toBe('other');
  });
});
