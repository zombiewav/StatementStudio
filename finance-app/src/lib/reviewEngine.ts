// The REVIEW mechanism: a pending-obligations follow-up list for balances
// that were deliberately left open when first recorded — Due to Officers,
// Due to Supplier, and Advances to Officers — plus the settlement math for
// each, taken directly from the working paper's own three worked examples
// (WEBSITE INPUT (ADDTL), rows 19-47).
//
// Pure, framework-free module, same pattern as journalEngine.ts and
// activitiesBreakdown.ts: takes JournalEntry[]/Account[] in, plain values
// out, independently testable.
import { Account, JournalEntry, JournalLine } from '../types';

// The accounts a transaction can leave open, each answering a different
// REVIEW question ("did you reimburse them yet?", "have you paid the
// supplier?", "did the officer actually use/settle the advance?", "has
// this now been used/consumed/benefited from?").
export const DONATED_FOOD_SUPPLIES_CODE = '1710';
export const DONATED_EVENT_SUPPLIES_CODE = '1720';
export const LOSS_FROM_SPOILAGE_CODE = '5170';
export const DONATED_INVENTORY_ACCOUNT_CODES = [DONATED_FOOD_SUPPLIES_CODE, DONATED_EVENT_SUPPLIES_CODE] as const;
export const OBLIGATION_ACCOUNT_CODES = ['2050', '2010', '2020', '1200', '1320', '1250', '1260', ...DONATED_INVENTORY_ACCOUNT_CODES] as const;
export type ObligationAccountCode = typeof OBLIGATION_ACCOUNT_CODES[number];

// Prepaid Expenses: the general "not yet used" holding account any
// mayDeferPortion-flagged transaction (see DEFAULT_RULES in
// FinanceContext.tsx) can defer part of its cost into, instead of
// expensing it immediately. Kept as one shared constant since both
// Transactions.tsx (the entry side) and Review.tsx (the settlement side)
// need the exact same code.
export const PREPAID_EXPENSE_CODE = '1260';
export const TEMPORARILY_RESTRICTED_REVENUE_CODE = '4035';
export const UNRESTRICTED_REVENUE_CODE = '4030';

export type ReviewStatus = 'complete' | 'incomplete' | 'reversed';

export interface TransactionReviewState {
  entry: JournalEntry;
  status: ReviewStatus;
  missing: string[];
  restrictedRemaining: number;
  completedOn?: string;
}

export interface PendingObligation {
  entryId: string;
  reviewEntryId: string;
  reference: string;
  date: string;
  description: string;
  project: string;
  eventName?: string;
  accountCode: ObligationAccountCode;
  originalAmount: number;
  settledAmount: number;
  remainingAmount: number;
}

const EPSILON = 0.005;

function rootReviewEntryId(entry: JournalEntry, entries: JournalEntry[]): string {
  let current = entry;
  const seen = new Set<string>();
  while (current.settlesEntryId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = entries.find(candidate => candidate.id === current.settlesEntryId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

/**
 * Every obligation-creating entry that still has an unsettled balance,
 * netted against every settlement entry posted against it (settlesEntryId).
 * A settlement entry is never itself treated as a new obligation.
 *
 * Which side "creates" the obligation depends on the account's own normal
 * balance, not a fixed debit/credit: Due to Officers and Due to Supplier
 * are Credit-normal liabilities (crediting them increases what's owed), but
 * Advances to Officers is a Debit-normal asset (giving the advance debits
 * it) — the same "increase" logic journalEngine.ts's deriveEffect already
 * uses elsewhere. Settling an obligation always posts to its opposite
 * (decrease) side.
 */
export function computePendingObligations(entries: JournalEntry[], accounts: Account[]): PendingObligation[] {
  const obligations: PendingObligation[] = [];

  for (const entry of entries) {
    // Reversals never create a new obligation. Settlement entries may create
    // a new follow-up obligation (for example, liquidating an advance can
    // create Due to Supplier), so they must still be examined.
    if (entry.reversalOfEntryId || entry.reversedByEntryId) continue;

    for (const line of entry.lines) {
      if (!OBLIGATION_ACCOUNT_CODES.includes(line.accountCode as ObligationAccountCode)) continue;
      const accountCode = line.accountCode as ObligationAccountCode;
      const account = accounts.find(a => a.code === accountCode);
      if (!account) continue;

      const increaseSide: 'debit' | 'credit' = account.normalBalance === 'Debit' ? 'debit' : 'credit';
      const createdAmount = increaseSide === 'debit' ? line.debit : line.credit;
      if (createdAmount <= EPSILON) continue;

      const settledAmount = entries
        .filter(e => e.settlesEntryId === entry.id)
        .reduce((sum, settlement) => {
          const settleLine = settlement.lines.find(l => l.accountCode === accountCode);
          if (!settleLine) return sum;
          // Signed so reversing a REVIEW settlement restores the exact
          // amount to the pending list instead of leaving it marked paid.
          return sum + (increaseSide === 'debit'
            ? settleLine.credit - settleLine.debit
            : settleLine.debit - settleLine.credit);
        }, 0);

      const remainingAmount = createdAmount - settledAmount;
      if (remainingAmount > EPSILON) {
        obligations.push({
          entryId: entry.id,
          reviewEntryId: rootReviewEntryId(entry, entries),
          reference: entry.reference,
          date: entry.date,
          description: entry.description,
          project: entry.project,
          eventName: entry.eventName,
          accountCode,
          originalAmount: createdAmount,
          settledAmount,
          remainingAmount,
        });
      }
    }
  }

  return obligations.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * One shared status source for REVIEW and the Financial Statements gate.
 * Original transaction entries stay visible after completion. Settlement,
 * reversal, beginning-balance and closing entries are supporting accounting
 * records and remain available in Journal Entries instead of appearing as
 * duplicate transactions here.
 */
export function computeTransactionReviewStates(entries: JournalEntry[], accounts: Account[]): TransactionReviewState[] {
  const pending = computePendingObligations(entries, accounts);
  const pendingByEntry = new Map<string, PendingObligation[]>();
  pending.forEach(item => pendingByEntry.set(item.reviewEntryId, [...(pendingByEntry.get(item.reviewEntryId) || []), item]));

  return entries
    .filter(entry =>
      !entry.settlesEntryId &&
      !entry.reversalOfEntryId &&
      !entry.description.startsWith('Beginning Balances') &&
      !entry.description.startsWith('Closing Entries')
    )
    .map(entry => {
      if (entry.reversedByEntryId) {
        return { entry, status: 'reversed' as const, missing: [], restrictedRemaining: 0 };
      }

      const missing = (pendingByEntry.get(entry.id) || []).map(item => {
        if (item.accountCode === PREPAID_EXPENSE_CODE) return `${obligationAccountLabel(item.accountCode, accounts)} still unused: ${item.remainingAmount}`;
        if (DONATED_INVENTORY_ACCOUNT_CODES.includes(item.accountCode as typeof DONATED_INVENTORY_ACCOUNT_CODES[number])) {
          return `${obligationAccountLabel(item.accountCode, accounts)} still unused or unresolved: ${item.remainingAmount}`;
        }
        return `${obligationAccountLabel(item.accountCode, accounts)} still open: ${item.remainingAmount}`;
      });

      const restrictedCreated = entry.lines
        .filter(line => line.accountCode === TEMPORARILY_RESTRICTED_REVENUE_CODE)
        .reduce((sum, line) => sum + line.credit - line.debit, 0);
      const restrictedReleased = entries
        .filter(candidate => candidate.settlesEntryId === entry.id)
        .flatMap(candidate => candidate.lines)
        .filter(line => line.accountCode === TEMPORARILY_RESTRICTED_REVENUE_CODE)
        .reduce((sum, line) => sum + line.debit - line.credit, 0);
      const restrictedRemaining = Math.max(0, restrictedCreated - restrictedReleased);
      if (restrictedRemaining > 0) missing.push(`Temporary donor restriction still open: ${restrictedRemaining}`);

      const status = missing.length > 0 ? 'incomplete' as const : 'complete' as const;
      const linkedDates = entries
        .filter(candidate => candidate.id !== entry.id && rootReviewEntryId(candidate, entries) === entry.id)
        .map(candidate => candidate.date);
      const completionDates = [entry.date, ...linkedDates].sort();
      return {
        entry,
        status,
        missing,
        restrictedRemaining,
        ...(status === 'complete' ? { completedOn: completionDates[completionDates.length - 1] || entry.date } : {}),
      };
    })
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.reference.localeCompare(a.entry.reference));
}

export function buildRestrictionReleaseLines(amount: number): JournalLine[] {
  if (amount <= 0) return [];
  return [
    { accountCode: TEMPORARILY_RESTRICTED_REVENUE_CODE, debit: amount, credit: 0 },
    { accountCode: UNRESTRICTED_REVENUE_CODE, debit: 0, credit: amount },
  ];
}

/**
 * Moves donated food or event supplies out of their temporary holding asset
 * as the organization uses them or determines that part was spoiled. The
 * caller chooses the normal usage expense (Meals & Refreshments for food or
 * Supplies Expense for other donated supplies); spoilage always goes to its
 * dedicated loss account.
 */
export function buildDonatedInventorySettlementLines(
  inventoryAccountCode: string,
  usageExpenseAccountCode: string,
  usedAmount: number,
  spoiledAmount: number
): JournalLine[] {
  const used = Math.max(0, usedAmount);
  const spoiled = Math.max(0, spoiledAmount);
  const total = used + spoiled;
  if (total <= 0) return [];

  const lines: JournalLine[] = [];
  if (used > 0) lines.push({ accountCode: usageExpenseAccountCode, debit: used, credit: 0 });
  if (spoiled > 0) lines.push({ accountCode: LOSS_FROM_SPOILAGE_CODE, debit: spoiled, credit: 0 });
  lines.push({ accountCode: inventoryAccountCode, debit: 0, credit: total });
  return lines;
}

/**
 * Due to Officers / Due to Supplier settlement (working paper rows 22-36):
 * a single mandatory "did you pay/reimburse this yet?" question, answered
 * Full / None / Partial. Paying 0 (the "None" answer) posts nothing — the
 * obligation stays open exactly as it was, which is a legitimate answer,
 * not an error.
 */
export function buildSimpleSettlementLines(
  obligationAccountCode: string,
  cashAccountCode: string,
  amount: number,
  normalBalance: 'Debit' | 'Credit' = 'Credit'
): JournalLine[] {
  if (amount <= 0) return [];
  if (normalBalance === 'Debit') {
    return [
      { accountCode: cashAccountCode, debit: amount, credit: 0 },
      { accountCode: obligationAccountCode, debit: 0, credit: amount },
    ];
  }
  return [
    { accountCode: obligationAccountCode, debit: amount, credit: 0 },
    { accountCode: cashAccountCode, debit: 0, credit: amount },
  ];
}

// Advances to Officers settlement (working paper rows 40-47): the cash was
// handed over before any expense was recorded, so REVIEW is the first time
// the actual expense (if any) gets posted. The paper's own table only
// covers five real combinations — not a full "used?" x "settled?" grid —
// so this is modeled as the five rows directly rather than as two
// independent yes/no questions.
export type AdvanceSettlementStatus =
  | 'used-paid-wholly' // row 43: fully used, fully covered by the advance
  | 'used-not-yet-paid' // row 44: fully used, but on credit — nothing paid from the advance itself
  | 'not-used' // row 45: not used at all — the whole advance is returned
  | 'used-partly-paid' // row 46: fully used, partly covered by the advance, rest owed to supplier
  | 'not-used-partly-paid'; // row 47: only partly used, the rest returned

export interface AdvanceSettlementResult {
  expenseAmount: number;
  cashAmount: number;
  dueToSupplierAmount: number;
}

/**
 * Verified by checking every row's debits sum to its credits for ARBITRARY
 * inputs, not just the paper's own worked example (advance = 1,000, partial
 * = 500) — that example is degenerate (partial happens to equal
 * advance-minus-partial), which silently masked a real imbalance in an
 * earlier version of 'used-partly-paid' until it was caught with a
 * different partial amount. See reviewEngine.test.ts.
 *
 * 'used-partly-paid' (row 46): the officer paid `partialAmount` of the
 * purchase to the supplier directly out of the advance; the unused rest of
 * the advance (originalAdvance - partialAmount) comes back as cash, and
 * that same remainder is still owed to the supplier directly (the purchase
 * happened at the advance's full value, only partly covered by the
 * advance itself).
 *
 * `partialAmount` is only used by the two "partly" statuses; the other
 * three are fixed by `originalAdvance` alone.
 */
export function computeAdvanceSettlement(
  status: AdvanceSettlementStatus,
  originalAdvance: number,
  partialAmount: number
): AdvanceSettlementResult {
  switch (status) {
    case 'used-paid-wholly':
      return { expenseAmount: originalAdvance, cashAmount: 0, dueToSupplierAmount: 0 };
    case 'used-not-yet-paid':
      return { expenseAmount: originalAdvance, cashAmount: originalAdvance, dueToSupplierAmount: originalAdvance };
    case 'not-used':
      return { expenseAmount: 0, cashAmount: originalAdvance, dueToSupplierAmount: 0 };
    case 'used-partly-paid': {
      const unpaidRemainder = originalAdvance - partialAmount;
      return { expenseAmount: originalAdvance, cashAmount: unpaidRemainder, dueToSupplierAmount: unpaidRemainder };
    }
    case 'not-used-partly-paid':
      return { expenseAmount: partialAmount, cashAmount: originalAdvance - partialAmount, dueToSupplierAmount: 0 };
  }
}

/**
 * Builds the settlement entry's lines. Advances to Officers is always
 * fully cleared (credited for the full original advance) regardless of
 * outcome — the advance itself is always resolved, one way or another,
 * by this entry. `expenseAccountCode` is required whenever expenseAmount
 * > 0 (every status except 'not-used') since the original entry never
 * specified what the money would be used for.
 */
export function buildAdvanceSettlementLines(
  expenseAccountCode: string | null,
  advanceAccountCode: string,
  cashAccountCode: string,
  dueToSupplierAccountCode: string,
  originalAdvance: number,
  result: AdvanceSettlementResult
): JournalLine[] {
  const lines: JournalLine[] = [];
  if (expenseAccountCode && result.expenseAmount > 0) {
    lines.push({ accountCode: expenseAccountCode, debit: result.expenseAmount, credit: 0 });
  }
  if (result.cashAmount > 0) {
    lines.push({ accountCode: cashAccountCode, debit: result.cashAmount, credit: 0 });
  }
  lines.push({ accountCode: advanceAccountCode, debit: 0, credit: originalAdvance });
  if (result.dueToSupplierAmount > 0) {
    lines.push({ accountCode: dueToSupplierAccountCode, debit: 0, credit: result.dueToSupplierAmount });
  }
  return lines;
}

/**
 * Prepaid Expenses settlement: "how much of this is now used?" against a
 * chosen expense account. Reclassifies from the balance-sheet asset into
 * the real expense — the matching principle finally catching up with the
 * cash that already went out at entry time. Structurally the same shape
 * as buildSimpleSettlementLines, but named separately since the two
 * obligation kinds read in opposite directions (there, the settlement
 * clears a liability by paying cash; here, it clears an asset by
 * recognizing an expense) and mixing them up would silently invert which
 * account gets debited.
 */
export function buildPrepaidExpenseSettlementLines(
  expenseAccountCode: string,
  amount: number
): JournalLine[] {
  if (amount <= 0) return [];
  return [
    { accountCode: expenseAccountCode, debit: amount, credit: 0 },
    { accountCode: PREPAID_EXPENSE_CODE, debit: 0, credit: amount },
  ];
}

export function obligationAccountLabel(accountCode: ObligationAccountCode, accounts: Account[]): string {
  return accounts.find(a => a.code === accountCode)?.name || accountCode;
}
