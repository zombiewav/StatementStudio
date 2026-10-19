import { Account } from '../types';
import { TransactionCategoryId } from './transactionCategories';

// Client (Oct 2026): a receivable that still has a balance must keep showing in the next semester (and later ones)
// until it reaches zero. Each row says where its collection is recorded.
interface CarriedReceivableConfig {
  code: string;
  collectionLabel: string;
  categoryId: TransactionCategoryId;
  typeName?: string;
  activityFeeChoice?: 'receivable';
}

export const CARRIED_RECEIVABLES: CarriedReceivableConfig[] = [
  { code: '1200', collectionLabel: 'Collection of Unpaid Sold Merchandise', categoryId: 'merchandise', typeName: 'Collection of Unpaid Sold Merchandise' },
  { code: '1320', collectionLabel: 'Collection of Receivables from Officers - Merchandise', categoryId: 'merchandise', typeName: 'Collection of Receivables from Officers - Merchandise' },
  { code: '1360', collectionLabel: 'Collections from Suppliers - Merchandise', categoryId: 'merchandise', typeName: 'Collections from Suppliers - Merchandise' },
  { code: '1300', collectionLabel: 'Membership Fees collections', categoryId: 'membership-fees' },
  { code: '1310', collectionLabel: 'Collection of Activity Fees Receivable', categoryId: 'activity-fees', activityFeeChoice: 'receivable' },
];

export interface CarriedReceivableRow extends CarriedReceivableConfig {
  name: string;
  /** What is still to collect (current ledger balance). */
  balance: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** Receivables that came in as a beginning balance and still have something left to collect. */
export function carriedReceivableRows(
  openingBalances: Record<string, number>,
  ledgerBalances: Record<string, number>,
  accounts: Pick<Account, 'code' | 'name'>[],
): CarriedReceivableRow[] {
  return CARRIED_RECEIVABLES.flatMap(config => {
    const carried = cents(Number(openingBalances[config.code] || 0));
    const balance = cents(Number(ledgerBalances[config.code] || 0));
    if (carried <= 0 || balance <= 0) return [];
    return [{ ...config, name: accounts.find(account => account.code === config.code)?.name || config.code, balance }];
  });
}
