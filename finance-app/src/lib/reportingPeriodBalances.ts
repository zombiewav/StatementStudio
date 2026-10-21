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

const linePostingDate = (entry: JournalEntry, line: JournalEntry['lines'][number]) => line.date || entry.date;

/**
 * The General Ledger only counts a line up to the period's last day (by that line's own posting date), so every
 * report that must tie to it (Trial Balance, Financial Statements, next semester's opening) reads the books through this.
 */
export function entriesThroughPeriodEnd(entries: JournalEntry[], endDate: string): JournalEntry[] {
  return entries.flatMap(entry => {
    const lines = entry.lines.filter(line => linePostingDate(entry, line) <= endDate);
    if (lines.length === entry.lines.length) return [entry];
    return lines.length ? [{ ...entry, lines }] : [];
  });
}

/** Lines dated after the period's last day: they are left out of the period's ending balances. */
export function linesAfterPeriodEnd(entries: JournalEntry[], endDate: string): { reference: string; accountCode: string; date: string; amount: number }[] {
  return entries.flatMap(entry => entry.lines
    .filter(line => linePostingDate(entry, line) > endDate)
    .map(line => ({ reference: entry.reference, accountCode: line.accountCode, date: linePostingDate(entry, line), amount: Math.max(line.debit, line.credit) })));
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

/**
 * Ending balance of every account at the period's last day: opening balance plus every line posted up to that day.
 * The General Ledger, Trial Balance and Statement of Financial Position all read their balances from here.
 */
export function periodEndingBalances(
  openingBalances: OpeningBalances,
  entries: JournalEntry[],
  accounts: Account[],
  endDate?: string | null,
): Record<string, number> {
  return combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(endDate ? entriesThroughPeriodEnd(entries, endDate) : entries, accounts), accounts);
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
