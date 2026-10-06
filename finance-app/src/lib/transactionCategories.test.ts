import { describe, expect, it } from 'vitest';
import { categorizeTransactionRule, TRANSACTION_CATEGORIES } from './transactionCategories';

const rule = (debitAccountCode: string, creditAccountCode: string, description: string) => ({
  debitAccountCode,
  creditAccountCode,
  description,
});

describe('transaction categories', () => {
  it('groups inventory purchases and merchandise sales together', () => {
    expect(categorizeTransactionRule(rule('1700', '1010', 'Merchandise Inventory Purchase'))).toBe('merchandise');
    expect(categorizeTransactionRule(rule('1010', '4070', 'Merchandise Sales Revenue'))).toBe('merchandise');
    expect(categorizeTransactionRule(rule('1010', '1360', 'Collection of Receivables from Suppliers'))).toBe('merchandise');
  });

  it('groups current and prior-period membership collections together', () => {
    expect(categorizeTransactionRule(rule('1010', '4040', 'Membership Dues Collected'))).toBe('membership-fees');
    expect(categorizeTransactionRule(rule('1010', '1300', "Collection of Previous School Year's Membership Fees Still Receivable"))).toBe('membership-fees');
  });

  it('keeps expense and PPE transaction types in separate dropdown categories', () => {
    expect(categorizeTransactionRule(rule('5040', '1010', 'Office Supplies Purchase'))).toBe('expense-transactions');
    expect(categorizeTransactionRule(rule('1500', '1010', 'Developer Laptop Purchase'))).toBe('ppe-transactions');
    expect(categorizeTransactionRule(rule('1650', '1010', 'Furniture & Fixtures Purchase'))).toBe('ppe-transactions');
    expect(categorizeTransactionRule(rule('1010', '4030', 'Sponsorship - Cash Contribution'))).toBe('other');
  });

  it('labels the catch-all group as Miscellaneous Transactions', () => {
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'other')?.label).toBe('Miscellaneous Transactions');
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'prepaid-assets')).toMatchObject({
      label: 'Prepaid Expenses and Other Assets',
      description: 'Record assets acquired in advance, whether paid or unpaid, that will be used or consumed later.',
    });
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'payables')?.label).toBe('Payables');
  });

  it('gives advances and reimbursements to officers their own transaction categories', () => {
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'advances-to-officers')?.label).toBe('Advances to Officers');
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'reimbursements-to-officers')?.label).toBe('Reimbursement to Officers');
    expect(categorizeTransactionRule(rule('1250', '1010', 'Advances to Officers'))).toBe('advances-to-officers');
    expect(categorizeTransactionRule(rule('2050', '1010', 'Reimbursement to Officers'))).toBe('reimbursements-to-officers');
    expect(categorizeTransactionRule(rule('1250', '1010', 'Cash Advance Given to Officer'))).toBe('advances-to-officers');
  });

  it('removes prior-period payable payments from miscellaneous', () => {
    expect(categorizeTransactionRule(rule('2010', '1010', 'Payment of Previous-Period/Semester Expense Payables'))).toBe('payables');
    expect(categorizeTransactionRule(rule('2030', '1010', 'Payment of Previous-Period PPE Payable'))).toBe('payables');
  });

  it('keeps other non-membership income under miscellaneous', () => {
    expect(categorizeTransactionRule(rule('1010', '4050', 'Advertising Revenue'))).toBe('other');
    expect(categorizeTransactionRule(rule('1010', '4050', 'Income from Cash Prizes Received'))).toBe('other');
    expect(categorizeTransactionRule(rule('1010', '4060', 'Interest Earned from Bank Savings'))).toBe('other');
  });
});
