import { ClassificationRule } from '../types';

export type TransactionCategoryId =
  | 'activity-fees'
  | 'merchandise'
  | 'membership-fees'
  | 'expense-transactions'
  | 'event-program-expenses'
  | 'depreciation'
  | 'ppe-transactions'
  | 'prepaid-assets'
  | 'payables'
  | 'advances-to-officers'
  | 'reimbursements-to-officers'
  | 'other';

export interface TransactionCategory {
  id: TransactionCategoryId;
  label: string;
  description: string;
}

export const TRANSACTION_CATEGORIES: TransactionCategory[] = [
  { id: 'activity-fees', label: 'Activity Fees', description: 'Collections for events, including future or postponed events.' },
  { id: 'merchandise', label: 'Merchandise Transactions', description: 'Buy inventory or record merchandise sales.' },
  { id: 'membership-fees', label: 'Membership Fees', description: 'Current and prior-period member collections.' },
  { id: 'expense-transactions', label: 'Expense Transactions', description: 'Operating, event, and administrative expenses.' },
  { id: 'event-program-expenses', label: 'Event/Program Expenses', description: 'Record event and program expenses under the Event Expense account.' },
  { id: 'depreciation', label: 'Depreciation', description: 'Non-cash depreciation of equipment and furniture.' },
  { id: 'ppe-transactions', label: 'PPE Transactions', description: 'Property, plant, equipment, and furniture purchases.' },
  { id: 'prepaid-assets', label: 'Prepaid Expenses and Other Assets', description: 'Record assets acquired in advance, whether paid or unpaid, that will be used or consumed later.' },
  { id: 'payables', label: 'Payables', description: 'Pay payable balances carried forward from the previous reporting period.' },
  { id: 'advances-to-officers', label: 'Advances to Officers', description: 'Cash advances released to accountable officers.' },
  { id: 'reimbursements-to-officers', label: 'Reimbursement to Officers', description: 'Payments of amounts currently due to accountable officers.' },
  { id: 'other', label: 'Miscellaneous Transactions', description: 'Other income, sponsorships, loans, and adjustments.' },
];

const isPurchaseAssetCode = (code: string): boolean => {
  const numericCode = Number(code);
  return numericCode === 1500 || (numericCode >= 1501 && numericCode <= 1516)
    || numericCode === 1650 || (numericCode >= 1651 && numericCode <= 1653);
};

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
