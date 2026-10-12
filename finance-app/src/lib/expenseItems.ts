// The "Dropdown" column of the client's Expense Transactions sheet, paired with
// the "Related Expense Account Name" it posts to. The user picks an item; the
// expense account is never chosen by hand.
export interface ExpenseItem {
  label: string;
  accountCode: string;
}

export const EXPENSE_ITEMS: readonly ExpenseItem[] = [
  { label: 'Delivery Fees/ Shipping Fees', accountCode: '5150' },
  { label: 'Load for Event Hosts', accountCode: '5130' },
  { label: 'Cash Prizes given to Event Participants', accountCode: '5120' },
  { label: 'Load Given as Prize to Event Participants', accountCode: '5120' },
  { label: 'Printing/Bookbinding/Photocopying of Accomplishment Reports and Other Documents', accountCode: '5140' },
  { label: 'Mass Offerings/Donations', accountCode: '5230' },
  { label: 'Purchase of Meals immediately consumed by participants, speakers and organizers', accountCode: '5080' },
  { label: 'Transportation Fare', accountCode: '5050' },
  { label: 'Transportation Allowance to hosts, speaker and guests', accountCode: '5050' },
  { label: 'Purchase/Printing of Tarpaulin, banners, brochures and other promotional materials', accountCode: '5250' },
  { label: 'Honorarium/Token – Speaker, Facilitator, or Judge', accountCode: '5200' },
  { label: 'Membership Fees paid to National Organization', accountCode: '5210' },
  { label: 'Recording Session/Station ID Fees', accountCode: '5260' },
  { label: 'Printer Repairs', accountCode: '5070' },
  { label: 'Cash In/Cash Out Fees', accountCode: '5100' },
  { label: 'Purchase of Cleaning Supplies', accountCode: '5330' },
  { label: 'Registration Fees for Seminars, Conferences and Competitions', accountCode: '5340' },
  { label: 'Permit Fees', accountCode: '5350' },
  { label: 'Rental of Small Equipments ( Microphone, Extension Wire, Tables and Chairs)', accountCode: '5020' },
  { label: 'Purchase of First Aid Kit and Medical Supplies', accountCode: '5360' },
];

export function expenseItemByLabel(label: string): ExpenseItem | undefined {
  return EXPENSE_ITEMS.find(item => item.label === label);
}

// Drafts saved before the item list existed only remember the expense account.
// Several items share an account, so the first one is the stand-in.
export function expenseItemForAccount(accountCode: string): ExpenseItem | undefined {
  return EXPENSE_ITEMS.find(item => item.accountCode === accountCode);
}
