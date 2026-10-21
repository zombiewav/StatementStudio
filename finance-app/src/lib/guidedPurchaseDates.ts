export interface PaymentDateRow {
  date: string;
  amount: string | number;
}

export interface GuidedPurchaseDateCheck {
  /** A date that must be filled in is missing. */
  required: string;
  /** A date is earlier than, or wrongly the same as, the transaction date. */
  order: string;
}

export const TRANSACTION_DATE_REQUIRED = 'Enter the date of the transaction.';
export const PAYMENT_DATE_REQUIRED = 'Enter the date of every payment.';
export const PAYMENT_BEFORE_TRANSACTION = 'A payment date cannot be earlier than the date of the transaction.';
export const PAYMENT_DATE_HELP = 'Date is required. Payment 1 can be on the transaction date; Payment 2 and later must be after it. Entered dates cannot repeat.';
export const LATER_PAYMENT_SAME_DATE = 'Only Payment 1 can be dated the same as the transaction. Payment 2 and later must be dated after the transaction date.';

/**
 * Client (Oct 20 2026), Expense and PPE / F&F purchases: the transaction date and every payment date are required, a payment
 * cannot be dated before the transaction, and only Payment 1 may share the transaction date (Payment 2 and later must come
 * after it). Each list is one source of payment (organization, officer, advance); rows without an amount are not payments.
 * Repeated payment dates are checked by the rows themselves, and the total against the cost by the posting engine.
 */
export function checkGuidedPurchaseDates(transactionDate: string, paymentLists: PaymentDateRow[][]): GuidedPurchaseDateCheck {
  const payments = paymentLists.map(rows => rows.filter(row => Number(row.amount) > 0));
  const required = !transactionDate
    ? TRANSACTION_DATE_REQUIRED
    : payments.some(rows => rows.some(row => !row.date)) ? PAYMENT_DATE_REQUIRED : '';

  let order = '';
  if (transactionDate) {
    payments.forEach(rows => rows.forEach((row, index) => {
      if (!row.date || order === PAYMENT_BEFORE_TRANSACTION) return;
      if (row.date < transactionDate) order = PAYMENT_BEFORE_TRANSACTION;
      else if (row.date === transactionDate && index > 0 && !order) order = LATER_PAYMENT_SAME_DATE;
    }));
  }
  return { required, order };
}
