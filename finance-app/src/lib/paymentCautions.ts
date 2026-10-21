import { OutrightExpensePaymentMethod } from './outrightExpense';

// The cautions and notes the client's rules documents require on the payment
// forms of Expense and PPE/F&F transactions. "expense" forms talk about the
// expense amount; "asset" forms talk about the purchase price of the asset.
export type GuidedPurchaseKind = 'expense' | 'asset';

const subject = (kind: GuidedPurchaseKind): string => kind === 'asset' ? 'Purchase Price of Asset' : 'expense amount';

export const paymentShortfallCaution = (kind: GuidedPurchaseKind): string =>
  `⚠️ Caution: The total amount paid is less than the ${subject(kind)}. The unpaid portion will be recorded as a payable. If the remaining amount is paid later within the current reporting period, you may update this transaction in the Review section.`;

export const paymentExceedsCaution = (kind: GuidedPurchaseKind): string =>
  `⚠️ Caution: Total Payment cannot exceed ${subject(kind)}`;

export const ADVANCE_NO_RECORD_CAUTION = '⚠️ Caution: No record of an accountable officer found. The table above shows the available cash advance balances per officer. Please record the cash advance given to the officer first under Advances to Officers Category before recording the expense.';

export type AdvanceIssue = 'amount-and-advance' | 'amount' | 'advance';

export const advanceCaution = (kind: GuidedPurchaseKind, issue: AdvanceIssue): string =>
  issue === 'amount-and-advance' ? `⚠️ Caution: Payment cannot exceed ${subject(kind)} and Advances made to the officer.`
    : issue === 'amount' ? `⚠️ Caution: Payment cannot exceed ${subject(kind)}`
      : '⚠️ Caution: Payment through advances by officer cannot exceed advances made to the officer.';

// Acquisition of Merchandise for Sale: payments are measured against the total
// cost of the batch, and paying more than that is allowed (the excess becomes
// a receivable from the supplier).
export const MERCHANDISE_PAYMENT_WINDOW_CAUTION = 'Caution: Record only payments made on or after the date the merchandise was received and is already on hand. Exclude downpayments made before receipt.';
export const MERCHANDISE_SHORTFALL_CAUTION = '⚠️ Caution: The total amount paid is less than the Total Cost of the Batch. The unpaid portion will be recorded as a payable. If the remaining amount is paid later within the current reporting period, you may update this transaction in the Review section.';
// Sale of Merchandise: the same note, worded for collections measured against the Total Sales.
export const MERCHANDISE_SALE_SHORTFALL_CAUTION = '⚠️ Caution: The total amount collected is less than the Total Sales. The uncollected portion will be recorded as a receivable. If the remaining amount is collected later within the current reporting period, you may update this transaction in the Review section.';
export const MERCHANDISE_TOTAL_COST_REMINDER = 'Enter the total amount spent to purchase and prepare the merchandise for sale. Include not only the purchase price but also other direct costs, such as design fees and labor costs for making the merchandise.';
export const MERCHANDISE_EXCESS_CAUTION = '⚠️ Caution: Total Payment exceeded the Total Cost of this batch. The excess payment will be recorded under Accounts Receivable – Supplier. If any excess payment has been refunded, please select “Collection of Refund from Supplier for Excess Payment” from the dropdown and enter the amount of the refund collected.';

export const OFFICER_REIMBURSEMENT_NOTE = 'Note: Any reimbursement to the officer should be recorded separately under the Reimbursement category.';

export interface GuidedPaymentState {
  method: OutrightExpensePaymentMethod;
  amount: number;
  organizationTotal: number;
  officerTotal: number;
  advanceTotal: number;
  /** What the selected accountable officer still has available from advances. */
  advanceBalance: number;
}

export interface GuidedPaymentCautions {
  shortfall: boolean;
  exceeds: boolean;
  reimbursementNote: boolean;
  /** Set when a payment made through the officer's cash advance breaks a limit. */
  advanceIssue: AdvanceIssue | null;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/** Which cautions apply. Only the amounts that belong to the chosen payment
 * method count, mirroring how the posting engine ignores hidden rows. */
export function guidedPaymentCautions(state: GuidedPaymentState): GuidedPaymentCautions {
  const { method } = state;
  const organization = method === 'organization-funds' || method === 'combination' ? state.organizationTotal : 0;
  const officer = method === 'officer-personal' || method === 'combination' ? state.officerTotal : 0;
  const advance = method === 'officer-advance' || method === 'combination' ? state.advanceTotal : 0;
  const paid = cents(organization + officer + advance);
  const total = cents(state.amount);
  const overAmount = total > 0 && paid > total;
  const overAdvance = advance > cents(state.advanceBalance);
  // Paying purely through an advance has its own wording; a combination keeps
  // the general "total payment" caution and adds the advance one on top.
  const advanceOnly = method === 'officer-advance';
  const advanceIssue: AdvanceIssue | null = advanceOnly
    ? (overAmount && overAdvance ? 'amount-and-advance' : overAmount ? 'amount' : overAdvance ? 'advance' : null)
    : method === 'combination' && overAdvance ? 'advance' : null;
  return {
    shortfall: total > 0 && method !== 'not-yet-paid' && paid < total,
    exceeds: overAmount && !advanceOnly,
    reimbursementNote: method === 'officer-personal' || (method === 'combination' && officer > 0),
    advanceIssue,
  };
}
