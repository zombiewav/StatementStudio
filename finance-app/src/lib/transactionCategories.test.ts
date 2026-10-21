import { describe, expect, it } from 'vitest';
import { categorizeTransactionRule, isDepreciationPickerTypeVisible, isRetiredAssetPickerType, isRetiredMerchandisePickerType, TRANSACTION_CATEGORIES } from './transactionCategories';

const rule = (debitAccountCode: string, creditAccountCode: string, description: string) => ({
  debitAccountCode,
  creditAccountCode,
  description,
});

describe('transaction categories', () => {
  it('hides the generic and retired depreciation choices and shows the sheet items', () => {
    for (const name of ['Depreciation Expense - Equipment', ...['Computer Hardware', 'Extension Wire', 'Other Small Equipment'].map(item => `Depreciation of ${item}`)]) {
      expect(isDepreciationPickerTypeVisible(name)).toBe(false);
    }
    for (const item of ['Laptop', 'Cabinet', 'Chairs', 'Tables/Desk']) {
      expect(isDepreciationPickerTypeVisible(`Depreciation of ${item}`)).toBe(true);
    }
  });
  it('hides the retired purchase choices from PPE', () => {
    for (const item of ['Computer Hardware', 'Extension Wire', 'Other Small Equipment']) {
      expect(isRetiredAssetPickerType(`Purchase of ${item}`)).toBe(true);
    }
    expect(isRetiredAssetPickerType('Purchase of Laptop')).toBe(false);
  });
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

  it('routes the shared Event/Program Expense account to its dedicated category', () => {
    expect(categorizeTransactionRule(rule('5300', '1010', 'Event/Program Expense'))).toBe('event-program-expenses');
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'event-program-expenses')?.label).toBe('Event/Program Expenses');
  });

  it('routes the item-specific PPE accounts to Property, Plant and Equipment', () => {
    expect(categorizeTransactionRule(rule('1501', '1010', 'Purchase of Laptop'))).toBe('ppe-transactions');
    expect(categorizeTransactionRule(rule('1516', '1010', 'Purchase of Other Small Equipment'))).toBe('ppe-transactions');
    expect(categorizeTransactionRule(rule('1651', '1010', 'Purchase of Cabinet'))).toBe('ppe-transactions');
    expect(categorizeTransactionRule(rule('1653', '1010', 'Purchase of Tables/Desks'))).toBe('ppe-transactions');
  });

  it('labels the catch-all group as Miscellaneous Transactions', () => {
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'other')?.label).toBe('Miscellaneous Transactions');
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'prepaid-assets')).toMatchObject({
      label: 'Prepaid Expenses and Other Assets',
      description: 'Record assets acquired in advance, whether paid or unpaid, that will be used or consumed later.',
    });
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'payables')?.label).toBe('Payables');
  });

  it('has separate tabs for Retirement of PPE and Return of Advances', () => {
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'retirement-of-ppe')?.label).toBe('Retirement of PPE');
    expect(TRANSACTION_CATEGORIES.find(category => category.id === 'return-of-advances')?.label).toBe('Return of Advances');
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

describe('merchandise payables', () => {
  it('are paid in Payables, so that Merchandise type is no longer offered', () => {
    expect(isRetiredMerchandisePickerType('Payment for Unpaid Merchandise Purchased and Received in Previous Period/Semester')).toBe(true);
    expect(isRetiredMerchandisePickerType('Sale of Merchandise')).toBe(false);
    expect(isRetiredMerchandisePickerType('Downpayment for Pre-ordered Merchandise')).toBe(true);
    expect(isRetiredMerchandisePickerType('Downpayment to Suppliers for Pre-Ordered Merchandise')).toBe(false);
  });

  it('offers the supplier refund collection under its new name and hides the former names', () => {
    expect(isRetiredMerchandisePickerType('Collection of Refund from Supplier for Excess Payment')).toBe(false);
    expect(isRetiredMerchandisePickerType('Collections from Suppliers - Merchandise')).toBe(true);
    expect(categorizeTransactionRule(rule('1010', '1360', 'Collection of Refund from Supplier for Excess Payment'))).toBe('merchandise');
  });
});
