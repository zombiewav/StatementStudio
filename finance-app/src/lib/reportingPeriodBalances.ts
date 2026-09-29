import { Account, JournalEntry } from '../types';
import { computeAccountBalances } from './accountTotals';

export type OpeningBalances = Record<string, number>;

// Only balance-sheet accounts that the organization asked to carry forward
// at this stage. Revenue and expenses remain activity for their own semester;
// Fund Balance is intentionally left untouched until its separate close logic
// is finalized.
const CARRIED_ACCOUNT_TYPES = new Set<Account['type']>(['Assets', 'Liabilities']);

export function appliesOpeningBalance(account: Account): boolean {
  return CARRIED_ACCOUNT_TYPES.has(account.type);
}

export function combineOpeningAndPeriodBalances(
  openingBalances: OpeningBalances,
  periodBalances: Record<string, number>,
  accounts: Account[],
): Record<string, number> {
  return accounts.reduce<Record<string, number>>((balances, account) => {
    balances[account.code] = (periodBalances[account.code] || 0)
      + (appliesOpeningBalance(account) ? (openingBalances[account.code] || 0) : 0);
    return balances;
  }, {});
}

// A semester's ending permanent balance becomes the next newly-created
// semester's opening balance. Existing workspaces keep their original opening
// balances so revisiting a prior period never rewrites its books.
export function carryForwardOpeningBalances(
  openingBalances: OpeningBalances,
  journalEntries: JournalEntry[],
  accounts: Account[],
): OpeningBalances {
  const periodBalances = computeAccountBalances(journalEntries, accounts);
  return accounts.reduce<OpeningBalances>((balances, account) => {
    if (appliesOpeningBalance(account)) {
      balances[account.code] = (openingBalances[account.code] || 0) + (periodBalances[account.code] || 0);
    }
    return balances;
  }, {});
}
