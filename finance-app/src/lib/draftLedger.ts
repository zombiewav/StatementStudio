import { Account, JournalEntry } from '../types';
import { computeAccountBalances } from './accountTotals';
import { combineOpeningAndPeriodBalances, OpeningBalances } from './reportingPeriodBalances';

export interface LedgerView {
  entries: JournalEntry[];
  balances: Record<string, number>;
}

/**
 * A saved draft already sits in the ledger, so while that same draft is being
 * edited it must not count against its own limits (an officer's payable, an
 * advance, cash, a linked downpayment, inventory units, and so on). This is the
 * ledger as it stands without the draft's own entry; with no draft being
 * edited it is the ledger unchanged.
 */
export function ledgerWithoutDraftEntry(
  entries: JournalEntry[],
  draftEntryId: string | undefined,
  accounts: Account[],
  openingBalances: OpeningBalances,
  currentBalances: Record<string, number>,
): LedgerView {
  if (!draftEntryId) return { entries, balances: currentBalances };
  const remaining = entries.filter(entry => entry.id !== draftEntryId);
  return {
    entries: remaining,
    balances: combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(remaining, accounts), accounts),
  };
}
