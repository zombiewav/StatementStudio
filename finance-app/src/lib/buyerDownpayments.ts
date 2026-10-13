import { DatedAmountRecord, JournalEntry, JournalLine } from '../types';

export const BUYER_DOWNPAYMENT_TITLE = 'Downpayment by Buyer for Pre-Ordered Merchandise';
export const BUYER_CASH_ACCOUNT_CODE = '1010';
export const UNEARNED_MERCHANDISE_REVENUE_CODE = '2140';

export interface BuyerDownpaymentInput {
  initial: DatedAmountRecord;
  /** Optional later downpayments; a blank date uses the initial downpayment's date. */
  subsequent?: DatedAmountRecord[];
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/**
 * Buyer downpayments for pre-ordered merchandise: Dr Cash / Cr Unearned Merchandise
 * Revenue for the total downpayments. Each date keeps its own balanced pair so the
 * ledger shows when every downpayment was received.
 */
export function buildBuyerDownpaymentPosting(input: BuyerDownpaymentInput): JournalLine[] {
  const initialAmount = cents(input.initial.amount);
  if (!Number.isFinite(initialAmount) || initialAmount <= 0) throw new Error('Enter the initial downpayment (greater than zero).');
  if (!input.initial.date) throw new Error('Enter the date of the initial downpayment.');

  const payments: DatedAmountRecord[] = [{ date: input.initial.date, amount: initialAmount }];
  for (const record of input.subsequent || []) {
    const amount = cents(record.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Subsequent downpayments cannot be negative.');
    if (amount > 0) payments.push({ date: record.date || input.initial.date, amount });
  }

  const byDate = new Map<string, number>();
  payments.forEach(payment => byDate.set(payment.date, cents((byDate.get(payment.date) || 0) + payment.amount)));
  return [...byDate.entries()].flatMap(([date, amount]): JournalLine[] => [
    { accountCode: BUYER_CASH_ACCOUNT_CODE, debit: amount, credit: 0, date },
    { accountCode: UNEARNED_MERCHANDISE_REVENUE_CODE, debit: 0, credit: amount, date },
  ]);
}

export const buyerDownpaymentTotal = (lines: JournalLine[]): number =>
  cents(lines.filter(line => line.accountCode === UNEARNED_MERCHANDISE_REVENUE_CODE).reduce((sum, line) => sum + line.credit - line.debit, 0));

// ---- Applying buyer downpayments to the sale of the same item and batch -------

export interface BuyerDownpaymentTotal {
  entryIds: string[];
  amount: number;
  draftCount: number;
}

const sameText = (left: string | undefined, right: string): boolean => (left || '').trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
const isActiveEntry = (entry: JournalEntry): boolean => !entry.reversalOfEntryId && !entry.reversedByEntryId;
const downpaymentOf = (entry: JournalEntry): number =>
  cents(entry.lines.filter(line => line.accountCode === UNEARNED_MERCHANDISE_REVENUE_CODE).reduce((sum, line) => sum + line.credit - line.debit, 0));

/** The active sale, if any, that already applied this buyer downpayment. */
export function saleLinkedToBuyerDownpayment(downpayment: JournalEntry, entries: JournalEntry[]): JournalEntry | undefined {
  return entries.find(candidate => candidate.id !== downpayment.id && isActiveEntry(candidate)
    && (candidate.transactionDetails?.merchandiseBuyerDownpaymentEntryIds || []).includes(downpayment.id));
}

/** Every buyer downpayment for this item and batch that no sale has applied yet. Saved drafts count
 * because a draft already sits in the ledger as if it were posted. */
export function aggregateAvailableBuyerDownpayments(entries: JournalEntry[], item: string, batch: string): BuyerDownpaymentTotal {
  if (!item.trim() || !batch.trim()) return { entryIds: [], amount: 0, draftCount: 0 };
  const used = new Set(entries.filter(isActiveEntry).flatMap(entry => entry.transactionDetails?.merchandiseBuyerDownpaymentEntryIds || []));
  const matching = entries
    .filter(entry => isActiveEntry(entry) && entry.transactionDetails?.merchandiseBuyerDownpayment && !used.has(entry.id)
      && sameText(entry.transactionDetails?.merchandiseItem, item) && sameText(entry.transactionDetails?.merchandiseBatch, batch))
    .map(entry => ({ entry, amount: downpaymentOf(entry) }))
    .filter(candidate => candidate.amount > 0);
  return {
    entryIds: matching.map(candidate => candidate.entry.id),
    amount: cents(matching.reduce((sum, candidate) => sum + candidate.amount, 0)),
    draftCount: matching.filter(candidate => candidate.entry.isDraft).length,
  };
}

/** Why a buyer downpayment cannot be deleted or reversed, when a sale applied it. */
export function buyerDownpaymentLinkBlock(downpayment: JournalEntry, entries: JournalEntry[]): string | undefined {
  const sale = saleLinkedToBuyerDownpayment(downpayment, entries);
  return sale
    ? `${downpayment.reference} is already applied to ${sale.reference}. Undo or delete that sale of merchandise first.`
    : undefined;
}

/** Why an applied buyer downpayment's amount cannot change: the sale already used it. */
export function buyerDownpaymentAmountChangeBlock(downpayment: JournalEntry, entries: JournalEntry[], nextLines: { accountCode: string; debit: number; credit: number }[]): string | undefined {
  const sale = saleLinkedToBuyerDownpayment(downpayment, entries);
  if (!sale) return undefined;
  const next = cents(nextLines.filter(line => line.accountCode === UNEARNED_MERCHANDISE_REVENUE_CODE).reduce((sum, line) => sum + line.credit - line.debit, 0));
  return next === downpaymentOf(downpayment) ? undefined
    : `${downpayment.reference} is already applied to ${sale.reference}, so its amount cannot change. Undo or delete that sale of merchandise first.`;
}
