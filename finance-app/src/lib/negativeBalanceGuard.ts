import { Account, ClosingRecord, JournalEntry } from '../types';
import { computeAccountBalances } from './accountTotals';
import { excludeClosingEntries } from './closingEntries';

type OpeningBalances = Record<string, number>;

function balancesOf(entries: JournalEntry[], accounts: Account[], openingBalances: OpeningBalances, closedFiscalYears: ClosingRecord[]): Record<string, number> {
  const balances = computeAccountBalances(excludeClosingEntries(entries, closedFiscalYears), accounts);
  Object.entries(openingBalances).forEach(([code, balance]) => { balances[code] = (balances[code] || 0) + balance; });
  return balances;
}

/**
 * Posting already refuses to leave an account negative. Deleting, reversing or editing an entry
 * can do the same to the postings that came after it (for example deleting a payable that was
 * already paid). Returns the first account that this change would push below zero, or undefined
 * when the change is safe. An account that was already negative is only flagged if it gets worse.
 * Fund Balance may be negative (a deficit), as in posting.
 */
export function negativeBalanceAfterChange(
  before: JournalEntry[],
  after: JournalEntry[],
  accounts: Account[],
  openingBalances: OpeningBalances,
  closedFiscalYears: ClosingRecord[] = [],
): Account | undefined {
  const previous = balancesOf(before, accounts, openingBalances, closedFiscalYears);
  const next = balancesOf(after, accounts, openingBalances, closedFiscalYears);
  return accounts.find(account => account.type !== 'Fund Balance'
    && (next[account.code] || 0) < -0.005
    && (next[account.code] || 0) < (previous[account.code] || 0) - 0.005);
}

export const negativeBalanceChangeMessage = (action: string, account: Account): string =>
  `${action} would give ${account.name} a negative balance, because later transactions depend on it. Reverse or remove those transactions first.`;
