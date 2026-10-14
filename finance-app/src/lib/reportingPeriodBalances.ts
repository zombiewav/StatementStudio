import { Account, JournalEntry } from '../types';
import { computeAccountBalances, computeTypeTotals } from './accountTotals';
import { FUND_BALANCE_CODE } from './closingEntries';

export type OpeningBalances = Record<string, number>;

// Only permanent accounts (the Statement of Financial Position balances) carry
// forward: Assets, Liabilities and Fund Balance. Revenue and expenses are
// temporary and start every semester at zero.
const CARRIED_ACCOUNT_TYPES = new Set<Account['type']>(['Assets', 'Liabilities', 'Fund Balance']);

export function appliesOpeningBalance(account: Account): boolean {
  return CARRIED_ACCOUNT_TYPES.has(account.type);
}

/**
 * The opening Statement of Financial Position always balances, so the opening Fund Balance is
 * whatever makes Assets = Liabilities + Fund Balance. Any part of it not already stored (for
 * example the previous semester's surplus when its closing entry was not posted yet, or a
 * semester created before Fund Balance was carried) is added to Fund Balance (3010).
 */
export function withCarriedFundBalance(openingBalances: OpeningBalances, accounts: Account[]): OpeningBalances {
  if (!accounts.some(account => account.code === FUND_BALANCE_CODE)) return openingBalances;
  const totals = computeTypeTotals(openingBalances, accounts);
  const missing = totals.Assets - totals.Liabilities - totals['Fund Balance'];
  if (Math.abs(missing) < 0.005) return openingBalances;
  return { ...openingBalances, [FUND_BALANCE_CODE]: (openingBalances[FUND_BALANCE_CODE] || 0) + missing };
}

export function combineOpeningAndPeriodBalances(
  openingBalances: OpeningBalances,
  periodBalances: Record<string, number>,
  accounts: Account[],
): Record<string, number> {
  const opening = withCarriedFundBalance(openingBalances, accounts);
  return accounts.reduce<Record<string, number>>((balances, account) => {
    balances[account.code] = (periodBalances[account.code] || 0)
      + (appliesOpeningBalance(account) ? (opening[account.code] || 0) : 0);
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
      const carried = (openingBalances[account.code] || 0) + (periodBalances[account.code] || 0);
      if (account.type !== 'Fund Balance' || Math.abs(carried) >= 0.005) balances[account.code] = carried;
    }
    return balances;
  }, {});
}
