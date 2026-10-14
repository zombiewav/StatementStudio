import { JournalLine } from '../types';

export type PayablePaymentMethod = 'organization-funds' | 'officer-personal' | 'officer-advance' | 'combination';

export const PRIOR_PERIOD_PAYABLE_CODES = ['2010', '2020', '2030', '2040', '2061', '2062', '2063', '2064'] as const;
export type PriorPeriodPayableCode = typeof PRIOR_PERIOD_PAYABLE_CODES[number];

// The Payables dropdown exactly as the client's Accounts sheet lists it,
// each choice paired with the payable account it settles.
export const PRIOR_PERIOD_PAYABLE_CHOICES: readonly { code: PriorPeriodPayableCode; label: string }[] = [
  { code: '2010', label: 'Payment of Accounts Payable from Previous Period – Expenses' },
  { code: '2030', label: 'Payment of Accounts Payable from Previous Period – PPE' },
  { code: '2040', label: 'Payment of Accounts Payable from Previous Period – Furniture and Fixtures' },
  { code: '2020', label: 'Payment of Accounts Payable from Previous Period – Merchandise' },
  { code: '2061', label: 'Payment of Accounts Payable from Previous Period - Awards and Prizes' },
  { code: '2062', label: 'Payment of Accounts Payable from Previous Period - Supplies and Materials' },
  { code: '2063', label: 'Payment of Accounts Payable from Previous Period - Prepaid Rent' },
  { code: '2064', label: 'Payment of Accounts Payable from Previous Period - Clothing/Uniform' },
];

export interface PayablePaymentInput {
  payableAccountCode: PriorPeriodPayableCode;
  paymentMethod: PayablePaymentMethod;
  transactionDate: string;
  organizationAmount?: number;
  officerAmount?: number;
  advanceAmount?: number;
  paymentDate?: string;
  outstandingBalance: number;
  availableCash: number;
  availableAdvance: number;
}

const cents = (value: number) => Math.round(Number(value || 0) * 100) / 100;

export function buildPriorPeriodPayablePayment(input: PayablePaymentInput): { lines: JournalLine[]; total: number } {
  const organizationAmount = input.paymentMethod === 'organization-funds' || input.paymentMethod === 'combination' ? cents(input.organizationAmount || 0) : 0;
  const officerAmount = input.paymentMethod === 'officer-personal' || input.paymentMethod === 'combination' ? cents(input.officerAmount || 0) : 0;
  const advanceAmount = input.paymentMethod === 'officer-advance' || input.paymentMethod === 'combination' ? cents(input.advanceAmount || 0) : 0;
  const total = cents(organizationAmount + officerAmount + advanceAmount);
  const remaining = cents(input.outstandingBalance);
  const postingDate = input.paymentDate || input.transactionDate;

  if (total <= 0) throw new Error('Enter a payment amount greater than zero.');
  if (total > remaining) throw new Error('Payment cannot exceed the outstanding balance of the selected payable account.');
  if (organizationAmount > cents(input.availableCash)) throw new Error('Organization payment cannot exceed the available cash balance.');
  if (advanceAmount > cents(input.availableAdvance)) throw new Error('Payment through an officer advance cannot exceed that officer’s available advance balance.');

  const lines: JournalLine[] = [{ accountCode: input.payableAccountCode, debit: total, credit: 0, date: postingDate }];
  if (organizationAmount > 0) lines.push({ accountCode: '1010', debit: 0, credit: organizationAmount, date: postingDate });
  if (advanceAmount > 0) lines.push({ accountCode: '1250', debit: 0, credit: advanceAmount, date: postingDate });
  if (officerAmount > 0) lines.push({ accountCode: '2050', debit: 0, credit: officerAmount, date: postingDate });
  return { lines, total };
}

/** What is still owed on a payable account: its live credit balance (beginning balance plus this period's payables, less payments). */
export function outstandingPayableBalance(accountBalances: Record<string, number>, accountCode: string): number {
  return Math.max(0, cents(accountBalances[accountCode] || 0));
}
