import { DatedAmountRecord, JournalLine } from '../types';

export type OutrightExpensePaymentMethod = 'organization-funds' | 'officer-personal' | 'officer-advance' | 'combination' | 'not-yet-paid';

export interface OutrightExpenseInput {
  expenseAccountCode: string;
  totalAmount: number;
  paymentMethod: OutrightExpensePaymentMethod;
  transactionDate?: string;
  organizationPayments?: DatedAmountRecord[];
  officerPayments?: DatedAmountRecord[];
  advancePayments?: DatedAmountRecord[];
  availableAdvance?: number;
  availableCash?: number;
  cashAccountCode?: string;
}

export interface OutrightExpensePosting {
  lines: JournalLine[];
  dueToSupplier: number;
  dueToOfficer: number;
  advanceUsed: number;
  cashPaid: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

function amount(label: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be negative.`);
  return cents(value);
}

function dated(label: string, records: DatedAmountRecord[] | undefined, fallbackDate?: string): DatedAmountRecord[] {
  return (records || []).map(record => ({
    date: record.date || fallbackDate || '',
    amount: amount(label, record.amount),
  })).filter(record => record.amount > 0);
}

function total(records: DatedAmountRecord[]): number {
  return cents(records.reduce((sum, record) => sum + record.amount, 0));
}

function addLine(lines: JournalLine[], accountCode: string, debit: number, credit: number, date?: string): void {
  if (debit <= 0 && credit <= 0) return;
  lines.push({ accountCode, debit: cents(debit), credit: cents(credit), ...(date ? { date } : {}) });
}

/** Builds the document's multi-batch outright-expense entry. Later dated
 * payments first clear Due to Supplier, so all lines remain balanced while
 * the ledger still shows the date of every payment batch. */
export function buildOutrightExpensePosting(input: OutrightExpenseInput): OutrightExpensePosting {
  const totalAmount = amount('Expense amount', input.totalAmount);
  if (totalAmount <= 0) throw new Error('Expense amount must be greater than zero.');

  const org = dated('Organization payment', input.organizationPayments, input.transactionDate);
  const officer = dated('Officer payment', input.officerPayments, input.transactionDate);
  const advance = dated('Advance payment', input.advancePayments, input.transactionDate);
  const orgTotal = total(org);
  const officerTotal = total(officer);
  const advanceTotal = total(advance);
  const paid = cents(orgTotal + officerTotal + advanceTotal);
  const availableAdvance = amount('Available officer advance', input.availableAdvance || 0);
  const availableCash = amount('Available cash', input.availableCash || 0);

  const allowed = input.paymentMethod === 'organization-funds' ? orgTotal
    : input.paymentMethod === 'officer-personal' ? officerTotal
      : input.paymentMethod === 'officer-advance' ? advanceTotal
        : input.paymentMethod === 'not-yet-paid' ? 0 : paid;
  if (input.paymentMethod !== 'combination' && paid !== allowed) throw new Error('Only enter payments for the selected payment method.');
  if (paid > totalAmount) throw new Error('Total payment cannot exceed the expense amount.');
  if (advanceTotal > availableAdvance) throw new Error('Payment through an officer advance cannot exceed the recorded advance balance.');
  if (orgTotal > availableCash) throw new Error('Organization cash payments cannot exceed the available cash balance.');

  const date = input.transactionDate || '';
  const isInitial = (record: DatedAmountRecord) => !date || !record.date || record.date === date;
  const lines: JournalLine[] = [];
  addLine(lines, input.expenseAccountCode, totalAmount, 0, date);

  const postPayments = (records: DatedAmountRecord[], accountCode: string) => records.forEach(record => {
    if (isInitial(record)) addLine(lines, accountCode, 0, record.amount, record.date);
    else {
      addLine(lines, '2010', record.amount, 0, record.date);
      addLine(lines, accountCode, 0, record.amount, record.date);
    }
  });
  postPayments(org, input.cashAccountCode || '1010');
  postPayments(officer, '2050');
  postPayments(advance, '1250');

  const initialPaid = cents(total(org.filter(isInitial)) + total(officer.filter(isInitial)) + total(advance.filter(isInitial)));
  const dueToSupplier = cents(totalAmount - initialPaid);
  addLine(lines, '2010', 0, dueToSupplier, date);

  const debitTotal = cents(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = cents(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debitTotal !== creditTotal) throw new Error('The outright expense entry is not balanced.');
  return { lines, dueToSupplier, dueToOfficer: officerTotal, advanceUsed: advanceTotal, cashPaid: orgTotal };
}
