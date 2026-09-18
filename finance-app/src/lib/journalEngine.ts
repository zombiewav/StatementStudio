// The posting engine described in the StatementStudio build plan: a pure,
// framework-free module that turns a debit/credit account pair into a
// balanced journal entry, and can check whether a given debit/credit pairing
// produces the Increase/Decrease effects someone expects.
//
// Nothing here talks to React, localStorage, or FinanceContext — it only
// takes an Account[] (the Chart of Accounts) and plain values in, and
// returns plain values out. That is what makes it independently testable
// (see Phase 3: running it over the working paper's 79 rows as a
// conformance check) and safe to call from the transaction form (Phase 4)
// without dragging in the whole app.
import { Account, JournalLine } from '../types';

export type EntryEffect = 'Increase' | 'Decrease';

// The direction money moves in a transaction. Determines which question
// ("what was it for?" vs "whose money paid for it?") resolves which side of
// the entry — see FUNDING_SOURCE_OPTIONS below for the money-out case.
export type TransactionDirection = 'money-out' | 'money-in' | 'transfer';

/**
 * Derives whether posting to `role` (debit or credit) on this account is an
 * Increase or a Decrease, from the account's own normal balance — the same
 * rule FinanceContext already uses to compute account balances. This is
 * intentionally derived, never stored or typed in, so a wrong account
 * mapping produces a visibly wrong effect instead of a silently-accepted
 * typo (the working paper's own Increase/Decrease columns have two such
 * typos — see Phase 3).
 */
export function deriveEffect(account: Account, role: 'debit' | 'credit'): EntryEffect {
  const isNormalSide = account.normalBalance === (role === 'debit' ? 'Debit' : 'Credit');
  return isNormalSide ? 'Increase' : 'Decrease';
}

export interface ResolvedEntry {
  debitAccountCode: string;
  creditAccountCode: string;
  debitEffect: EntryEffect;
  creditEffect: EntryEffect;
}

export class UnknownAccountError extends Error {
  constructor(code: string) {
    super(`No account found with code "${code}".`);
    this.name = 'UnknownAccountError';
  }
}

/**
 * Resolves a debit/credit account pair into the effects each side has,
 * given the current Chart of Accounts. Throws UnknownAccountError if either
 * code doesn't exist, rather than silently treating it as some default —
 * a missing account is a real error, not a case to guess through.
 */
export function resolveEntry(
  accounts: Account[],
  debitAccountCode: string,
  creditAccountCode: string
): ResolvedEntry {
  const debitAccount = accounts.find(a => a.code === debitAccountCode);
  const creditAccount = accounts.find(a => a.code === creditAccountCode);

  if (!debitAccount) throw new UnknownAccountError(debitAccountCode);
  if (!creditAccount) throw new UnknownAccountError(creditAccountCode);

  return {
    debitAccountCode,
    creditAccountCode,
    debitEffect: deriveEffect(debitAccount, 'debit'),
    creditEffect: deriveEffect(creditAccount, 'credit'),
  };
}

/**
 * Builds the two balanced JournalLine entries for a debit/credit pair and
 * an amount — the same two-line shape Transactions.tsx currently builds by
 * hand. Centralizing it here means the form (Phase 4) and the conformance
 * tests (Phase 3) build entries the exact same way.
 */
export function buildJournalLines(
  debitAccountCode: string,
  creditAccountCode: string,
  amount: number
): JournalLine[] {
  return [
    { accountCode: debitAccountCode, debit: amount, credit: 0 },
    { accountCode: creditAccountCode, debit: 0, credit: amount },
  ];
}

export interface JournalLinePair {
  debitAccountCode: string;
  creditAccountCode: string;
  amount: number;
}

/**
 * Builds a balanced JournalLine[] from one or more debit/credit pairs,
 * flattening them into a single multi-line entry. Used wherever one user
 * action needs to post more than a simple two-line entry: the Membership
 * Fees accrual-completion entry (cash-collected pair + remaining-unpaid
 * pair) and the REVIEW settlement entries (up to two pairs — clearing an
 * obligation plus, in the cash-advance case, recognizing the expense and
 * any new amount owed to a supplier). Pairs with a zero or negative amount
 * are dropped, so answering a mandatory question with "0" (nothing
 * collected/owed/used) doesn't clutter the ledger with a no-op line.
 */
export function buildCompoundJournalLines(pairs: JournalLinePair[]): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const pair of pairs) {
    if (pair.amount <= 0) continue;
    lines.push(
      { accountCode: pair.debitAccountCode, debit: pair.amount, credit: 0 },
      { accountCode: pair.creditAccountCode, debit: 0, credit: pair.amount },
    );
  }
  return lines;
}

export interface EffectCheckResult {
  debitMatches: boolean;
  creditMatches: boolean;
  ok: boolean;
  resolved: ResolvedEntry;
}

/**
 * Checks a debit/credit pairing against the Increase/Decrease effects
 * someone expects (e.g. the working paper's own "Debited Account" /
 * "Credited Account" effect columns). This is the self-test mechanism the
 * build plan calls for in Phase 3: the paper's own answer key becomes an
 * automatic check on the mapping, not just prose to read.
 */
export function checkEntryEffects(
  accounts: Account[],
  debitAccountCode: string,
  creditAccountCode: string,
  expectedDebitEffect: EntryEffect,
  expectedCreditEffect: EntryEffect
): EffectCheckResult {
  const resolved = resolveEntry(accounts, debitAccountCode, creditAccountCode);
  const debitMatches = resolved.debitEffect === expectedDebitEffect;
  const creditMatches = resolved.creditEffect === expectedCreditEffect;
  return {
    debitMatches,
    creditMatches,
    ok: debitMatches && creditMatches,
    resolved,
  };
}

// --- Question B: "whose money paid for it?" -------------------------------
//
// For a money-out transaction, this is the funding-source question that
// resolves the credit side, generalized from the working paper's Sheet2
// example (Payment for Meals) and cross-checked against Sheet1/ADDITIONAL,
// where it accounts for the credit side of nearly every expense row. It is
// deliberately small and general — five answers, not 79 rows — because the
// paper demonstrates this mapping holds the same way regardless of what the
// debit side of the transaction is.
export interface FundingSourceOption {
  id: string;
  label: string;
  creditAccountCode: string;
}

export const FUNDING_SOURCE_OPTIONS: FundingSourceOption[] = [
  {
    id: 'cash-on-hand',
    label: "The organization's cash on hand",
    creditAccountCode: '1010',
  },
  {
    id: 'cash-in-bank',
    label: "The organization's bank, GCash, or Maya",
    creditAccountCode: '1015',
  },
  {
    id: 'officer-personal-money',
    label: "An officer's own money (to be reimbursed later)",
    creditAccountCode: '2050',
  },
  {
    id: 'officer-cash-advance',
    label: 'A cash advance already given to an officer',
    creditAccountCode: '1250',
  },
  {
    id: 'on-account',
    label: 'Not yet paid — on account with a vendor',
    creditAccountCode: '2010',
  },
];
