// Year-end closing: zero out every temporary account (Revenue, Expenses)
// into Fund Balance, so a subsequent period starts them fresh and every
// non-date-filtered view (Dashboard, Trial Balance, General Ledger) shows
// only the current period's activity instead of it piling up across years.
// Permanent accounts (Assets, Liabilities, Fund Balance) need no separate
// "carry forward" step — their balance is already the running total of
// every entry to date, so posting this closing entry is the only action
// required for next period to pick up where this one left off.
import { Account, ClosingRecord, JournalEntry, JournalLine } from '../types';
import { computeTransactionReviewStates, TransactionReviewState } from './reviewEngine';

export interface ClosingEntryResult {
  lines: JournalLine[];
  netIncome: number;
  totalRevenue: number;
  totalExpenses: number;
}

/**
 * Closing entries belong in the ledger and point-in-time balances, but they
 * are not operating activity. Excluding their recorded journal IDs preserves
 * the original Revenue/Expense presentation on period-performance reports.
 */
export function excludeClosingEntries(
  entries: JournalEntry[],
  closedFiscalYears: ClosingRecord[]
): JournalEntry[] {
  const closingEntryIds = new Set(closedFiscalYears.map(record => record.journalEntryId));
  return entries.filter(entry => !closingEntryIds.has(entry.id));
}

export function findFiscalCloseBlockers(entries: JournalEntry[], accounts: Account[]): TransactionReviewState[] {
  return computeTransactionReviewStates(entries, accounts).filter(state => state.status === 'incomplete');
}

export function computeClosingEntryLines(
  accountBalances: Record<string, number>,
  accounts: Account[],
  fundBalanceAccountCode: string
): ClosingEntryResult {
  const lines: JournalLine[] = [];
  let totalRevenue = 0;
  let totalExpenses = 0;

  accounts.forEach(acc => {
    const balance = accountBalances[acc.code] || 0;
    if (balance === 0) return;

    if (acc.type === 'Revenue') {
      // Credit-normal: a positive balance is a net credit position,
      // cleared by debiting it (the reverse of what grew it).
      if (balance > 0) {
        lines.push({ accountCode: acc.code, debit: balance, credit: 0 });
      } else {
        lines.push({ accountCode: acc.code, debit: 0, credit: -balance });
      }
      totalRevenue += balance;
    } else if (acc.type === 'Expenses') {
      // Debit-normal: a positive balance is a net debit position,
      // cleared by crediting it.
      if (balance > 0) {
        lines.push({ accountCode: acc.code, debit: 0, credit: balance });
      } else {
        lines.push({ accountCode: acc.code, debit: -balance, credit: 0 });
      }
      totalExpenses += balance;
    }
  });

  const netIncome = totalRevenue - totalExpenses;

  // The plug that keeps the entry balanced: a surplus increases Fund
  // Balance (credit), a deficit decreases it (debit) — same direction
  // net income always moves equity.
  if (netIncome > 0) {
    lines.push({ accountCode: fundBalanceAccountCode, debit: 0, credit: netIncome });
  } else if (netIncome < 0) {
    lines.push({ accountCode: fundBalanceAccountCode, debit: -netIncome, credit: 0 });
  }

  return { lines, netIncome, totalRevenue, totalExpenses };
}
