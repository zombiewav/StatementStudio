import { DatedAmountRecord, JournalLine } from '../types';

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
