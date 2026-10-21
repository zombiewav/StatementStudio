import { ClassificationRule } from '../types';

export type TransactionCategoryId =
  | 'activity-fees'
  | 'merchandise'
  | 'membership-fees'
  | 'expense-transactions'
  | 'event-program-expenses'
  | 'depreciation'
  | 'ppe-transactions'
  | 'retirement-of-ppe'
  | 'prepaid-assets'
  | 'payables'
  | 'advances-to-officers'
  | 'return-of-advances'
  | 'reimbursements-to-officers'
  | 'other';

export interface TransactionCategory {
  id: TransactionCategoryId;
  label: string;
  description: string;
}

// Client (Oct 21 2026): the Event/Program Expenses, Depreciation and Retirement of PPE boxes are gone from the picker.
// Their ids stay in TransactionCategoryId so saved drafts and entries still resolve; Depreciation and Retirement of PPE
// are recorded in Other Adjustments, and PPE Transactions only shows them (disabled) with "See Other Adjustments."
export const TRANSACTION_CATEGORIES: TransactionCategory[] = [
  { id: 'membership-fees', label: 'Membership Fees', description: 'Current and prior-period member collections.' },
  { id: 'activity-fees', label: 'Activity Fees', description: 'Collections for events, including future or postponed events.' },
  { id: 'merchandise', label: 'Merchandise Transactions', description: 'Buy inventory or record merchandise sales.' },
  { id: 'expense-transactions', label: 'Expense Transactions', description: 'Operating, event, and administrative expenses.' },
  { id: 'ppe-transactions', label: 'PPE Transactions', description: 'Property, plant, equipment, and furniture purchases, depreciation and retirement.' },
  { id: 'prepaid-assets', label: 'Prepaid Expenses and Other Assets', description: 'Record assets acquired in advance, whether paid or unpaid, that will be used or consumed later.' },
  { id: 'payables', label: 'Payables', description: 'Pay payable balances carried forward from the previous reporting period.' },
  { id: 'advances-to-officers', label: 'Advances to Officers', description: 'Cash advances released to accountable officers.' },
  { id: 'return-of-advances', label: 'Return of Advances', description: 'Cash an accountable officer returns from an advance.' },
  { id: 'reimbursements-to-officers', label: 'Reimbursement to Officers', description: 'Payments of amounts currently due to accountable officers.' },
  { id: 'other', label: 'Miscellaneous Transactions', description: 'Other income, sponsorships, loans, and adjustments.' },
];

const isPurchaseAssetCode = (code: string): boolean => {
  const numericCode = Number(code);
  return numericCode === 1500 || (numericCode >= 1501 && numericCode <= 1516)
    || numericCode === 1650 || (numericCode >= 1651 && numericCode <= 1653);
};

// Items an older Revisions file asked for that the client's current Accounts
// sheet no longer lists. Their rules stay so saved entries and drafts still
// resolve, but they are not offered in the PPE or Depreciation dropdowns.
const RETIRED_ASSET_ITEMS = ['Computer Hardware', 'Extension Wire', 'Other Small Equipment'];

export function isRetiredAssetPickerType(description: string): boolean {
  return RETIRED_ASSET_ITEMS.some(item => description === `Purchase of ${item}` || description === `Depreciation of ${item}`);
}

// Paying a previous-period Merchandise payable happens in the Payables category, where the carried-forward
// balance is tracked. The rule stays so older entries and drafts still resolve.
export function isRetiredMerchandisePickerType(description: string): boolean {
  return description === 'Payment for Unpaid Merchandise Purchased and Received in Previous Period/Semester'
    || description === 'Downpayment for Pre-ordered Merchandise'
    || description === 'Collection of Receivables from Suppliers'
    || description === 'Collections from Suppliers - Merchandise';
}

// Client (Oct 2026): Merchandise Transactions has two dropdowns, like PPE has its PPE and F&F dropdowns:
// Purchase (these three types) and Sales (every remaining merchandise type).
export const MERCHANDISE_PURCHASE_TYPES = [
  'Acquisition of Merchandise for Sale - Goods Received and On Hand',
  'Collection of Refund from Supplier for Excess Payment',
  'Downpayment to Suppliers for Pre-Ordered Merchandise',
];

export const isMerchandisePurchaseType = (description: string): boolean => MERCHANDISE_PURCHASE_TYPES.includes(description);

export function isDepreciationPickerTypeVisible(description: string): boolean {
  return description !== 'Depreciation Expense - Equipment' && !isRetiredAssetPickerType(description);
}

export function categorizeTransactionRule(rule: Pick<ClassificationRule, 'debitAccountCode' | 'creditAccountCode' | 'description'>): Exclude<TransactionCategoryId, 'activity-fees'> {
  const description = rule.description.toLowerCase();

  if (rule.debitAccountCode === '5300') return 'event-program-expenses';

  if (rule.debitAccountCode === '1700' || rule.creditAccountCode === '4070' || rule.creditAccountCode === '1360' || description.includes('merchandise')) {
    return 'merchandise';
  }

  if (rule.creditAccountCode === '4040' || rule.creditAccountCode === '1300' || rule.debitAccountCode === '2130' || description.includes("school year's membership")) {
    return 'membership-fees';
  }

  if (rule.debitAccountCode === '1250') {
    return 'advances-to-officers';
  }

  if (rule.debitAccountCode === '2050') {
    return 'reimbursements-to-officers';
  }

  if (['2010', '2020', '2030', '2040', '2061', '2062', '2063', '2064'].includes(rule.debitAccountCode)) {
    return 'payables';
  }

  if (isPurchaseAssetCode(rule.debitAccountCode)) {
    return 'ppe-transactions';
  }

  if (['5090', '5095'].includes(rule.debitAccountCode)) return 'depreciation';

  const debitCode = Number(rule.debitAccountCode);
  if (debitCode >= 5000 && debitCode < 6000) {
    return 'expense-transactions';
  }

  return 'other';
}
