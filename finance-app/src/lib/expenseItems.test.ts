import { describe, expect, it } from 'vitest';
import { INITIAL_ACCOUNTS, restoreSavedAccounts } from '../context/FinanceContext';
import { EXPENSE_ITEMS, expenseItemByLabel, expenseItemForAccount } from './expenseItems';

// "Dropdown" -> "Related Expense Account Name" from the client's Expense Transactions sheet.
const sheet = [
  ['Delivery Fees/ Shipping Fees', 'Delivery Expense'],
  ['Load for Event Hosts', 'Communication Expense'],
  ['Cash Prizes given to Event Participants', 'Award and Prizes Expense'],
  ['Load Given as Prize to Event Participants', 'Award and Prizes Expense'],
  ['Printing/Bookbinding/Photocopying of Accomplishment Reports and Other Documents', 'Printing Expense'],
  ['Mass Offerings/Donations', 'Donations and Contributions Expense'],
  ['Purchase of Meals immediately consumed by participants, speakers and organizers', 'Food and Meals Expense'],
  ['Transportation Fare', 'Transportation Expense'],
  ['Transportation Allowance to hosts, speaker and guests', 'Transportation Expense'],
  ['Purchase/Printing of Tarpaulin, banners, brochures and other promotional materials', 'Promotional and Advertising Expense'],
  ['Honorarium/Token – Speaker, Facilitator, or Judge', 'Honorarium Expense'],
  ['Membership Fees paid to National Organization', 'Membership Expense'],
  ['Recording Session/Station ID Fees', 'Recording and Production Expense'],
  ['Printer Repairs', 'Repairs and Maintenance Expense'],
  ['Cash In/Cash Out Fees', 'Bank Charges'],
  ['Purchase of Cleaning Supplies', 'Cleaning Supplies Expense'],
  ['Registration Fees for Seminars, Conferences and Competitions', 'Registration Expense'],
  ['Permit Fees', 'Permits and Licenses Expense'],
  ['Rental of Small Equipments ( Microphone, Extension Wire, Tables and Chairs)', 'Rent Expense'],
  ['Purchase of First Aid Kit and Medical Supplies', 'Medical Supplies Expense'],
] as const;

describe('Expense Transactions item dropdown', () => {
  it('lists exactly the sheet items in order', () => {
    expect(EXPENSE_ITEMS.map(item => item.label)).toEqual(sheet.map(([label]) => label));
  });

  it.each(sheet)('%s posts to %s', (label, accountName) => {
    const item = expenseItemByLabel(label);
    const account = INITIAL_ACCOUNTS.find(candidate => candidate.code === item?.accountCode);
    expect(account?.name).toBe(accountName);
    expect(account?.type).toBe('Expenses');
    expect(account?.normalBalance).toBe('Debit');
  });

  it('finds a stand-in item for drafts that only saved an account code', () => {
    expect(expenseItemForAccount('5050')?.label).toBe('Transportation Fare');
    expect(expenseItemForAccount('9999')).toBeUndefined();
  });

  it('adds the new accounts and the sheet wording to older saved workspaces', () => {
    const saved = INITIAL_ACCOUNTS
      .filter(account => !['5330', '5340', '5350', '5360'].includes(account.code))
      .map(account => account.code === '5080' ? { ...account, name: 'Meals and Refreshments Expense' }
        : account.code === '5200' ? { ...account, name: 'Honoraria Expense' } : account);
    const restored = restoreSavedAccounts(saved);
    const name = (code: string) => restored.find(account => account.code === code)?.name;
    expect(name('5330')).toBe('Cleaning Supplies Expense');
    expect(name('5340')).toBe('Registration Expense');
    expect(name('5350')).toBe('Permits and Licenses Expense');
    expect(name('5360')).toBe('Medical Supplies Expense');
    expect(name('5080')).toBe('Food and Meals Expense');
    expect(name('5200')).toBe('Honorarium Expense');
  });
});
