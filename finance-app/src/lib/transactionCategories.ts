import { ClassificationRule } from '../types';

export type TransactionCategoryId =
  | 'activity-fees'
  | 'merchandise'
  | 'membership-fees'
  | 'purchases'
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
  { id: 'purchases', label: 'Purchases', description: 'Supplies, equipment, services, and operating expenses.' },
  { id: 'other', label: 'Other Transactions', description: 'Income, sponsorships, loans, adjustments, and other entries.' },
];

const PURCHASE_ASSET_CODES = new Set(['1500', '1650']);

export function categorizeTransactionRule(rule: Pick<ClassificationRule, 'debitAccountCode' | 'creditAccountCode' | 'description'>): Exclude<TransactionCategoryId, 'activity-fees'> {
  const description = rule.description.toLowerCase();

  if (rule.debitAccountCode === '1700' || rule.creditAccountCode === '4070' || description.includes('merchandise')) {
    return 'merchandise';
  }

  if (rule.creditAccountCode === '4040' || rule.creditAccountCode === '1300' || description.includes("school year's membership")) {
    return 'membership-fees';
  }

  const debitCode = Number(rule.debitAccountCode);
  if ((debitCode >= 5000 && debitCode < 6000) || PURCHASE_ASSET_CODES.has(rule.debitAccountCode)) {
    return 'purchases';
  }

  return 'other';
}
