import { DatedAmountRecord, JournalLine } from '../types';

export const MERCHANDISE_INVENTORY_ACCOUNT_CODE = '1700';
export const MERCHANDISE_PAYABLE_ACCOUNT_CODE = '2020';
export const ADVANCES_TO_OFFICERS_ACCOUNT_CODE = '1250';
export const DUE_TO_OFFICERS_ACCOUNT_CODE = '2050';

export type MerchandisePaymentMethod =
  | 'organization-funds'
  | 'officer-personal'
  | 'organization-advance'
  | 'advance-and-personal'
  | 'not-yet-paid';

export interface MerchandiseAcquisitionInput {
  totalCost: number;
  paymentMethod: MerchandisePaymentMethod;
  transactionDate?: string;
  cashAccountCode?: string;
  organizationPayment?: number;
  organizationPayments?: DatedAmountRecord[];
  officerPayment?: number;
  officerPayments?: DatedAmountRecord[];
  reimbursement?: number;
  reimbursements?: DatedAmountRecord[];
  advancePayment?: number;
  advancePayments?: DatedAmountRecord[];
  availableAdvance?: number;
}

export interface MerchandiseAcquisitionPosting {
  lines: JournalLine[];
  merchandisePayable: number;
  dueToOfficer: number;
  advanceUsed: number;
  cashPaid: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

function requireNonNegative(label: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be negative.`);
  return cents(value);
}

function datedAmounts(label: string, records: DatedAmountRecord[] | undefined, fallbackAmount: number, fallbackDate?: string): DatedAmountRecord[] {
  const source = records?.length ? records : fallbackAmount > 0 ? [{ date: fallbackDate || '', amount: fallbackAmount }] : [];
  return source.map(record => ({
    date: record.date || fallbackDate || '',
    amount: requireNonNegative(label, record.amount),
  })).filter(record => record.amount > 0);
}

function total(records: DatedAmountRecord[]): number {
  return cents(records.reduce((sum, record) => sum + record.amount, 0));
}

function addLine(lines: JournalLine[], accountCode: string, debit: number, credit: number, date?: string): void {
  const amount = debit || credit;
  if (amount <= 0) return;
  lines.push({ accountCode, debit: cents(debit), credit: cents(credit), ...(date ? { date } : {}) });
}

/**
 * Builds the complete first-period acquisition entry from the client's
 * five payment branches. The full purchase cost is always recognized as
 * merchandise inventory; only the credit-side settlement mix changes.
 */
export function buildMerchandiseAcquisitionPosting(input: MerchandiseAcquisitionInput): MerchandiseAcquisitionPosting {
  const totalCost = requireNonNegative('Total merchandise cost', input.totalCost);
  if (totalCost <= 0) throw new Error('Total merchandise cost must be greater than zero.');

  const organizationPayments = datedAmounts('Organization payment', input.organizationPayments, input.organizationPayment || 0, input.transactionDate);
  const officerPayments = datedAmounts('Officer payment', input.officerPayments, input.officerPayment || 0, input.transactionDate);
  const reimbursements = datedAmounts('Officer reimbursement', input.reimbursements, input.reimbursement || 0, input.transactionDate);
  const advancePayments = datedAmounts('Advance used', input.advancePayments, input.advancePayment || 0, input.transactionDate);
  const organizationPayment = total(organizationPayments);
  const officerPayment = total(officerPayments);
  const reimbursement = total(reimbursements);
  const advancePayment = total(advancePayments);
  const availableAdvance = requireNonNegative('Available officer advance', input.availableAdvance || 0);
  const cashAccountCode = input.cashAccountCode || '1010';

  let supplierPaid = 0;
  let cashPaid = 0;
  let dueToOfficer = 0;
  let advanceUsed = 0;

  if (input.paymentMethod === 'organization-funds') {
    supplierPaid = organizationPayment;
    cashPaid = organizationPayment;
  } else if (input.paymentMethod === 'officer-personal') {
    supplierPaid = officerPayment;
    cashPaid = reimbursement;
    if (reimbursement > officerPayment) throw new Error('The reimbursement cannot exceed what the officer paid personally.');
    dueToOfficer = cents(officerPayment - reimbursement);
  } else if (input.paymentMethod === 'organization-advance') {
    supplierPaid = advancePayment;
    advanceUsed = advancePayment;
  } else if (input.paymentMethod === 'advance-and-personal') {
    supplierPaid = cents(advancePayment + officerPayment);
    advanceUsed = advancePayment;
    cashPaid = reimbursement;
    if (reimbursement > officerPayment) throw new Error('The reimbursement cannot exceed what the officer paid personally.');
    dueToOfficer = cents(officerPayment - reimbursement);
  }

  if (advanceUsed > availableAdvance) {
    throw new Error('The advance used cannot exceed the recorded Advances to Officers balance.');
  }
  if (supplierPaid > totalCost) {
    throw new Error('Payments to the supplier cannot exceed the total merchandise cost.');
  }

  const merchandisePayable = cents(totalCost - supplierPaid);
  const lines: JournalLine[] = [];
  addLine(lines, MERCHANDISE_INVENTORY_ACCOUNT_CODE, totalCost, 0, input.transactionDate);

  if (input.paymentMethod === 'organization-funds') {
    organizationPayments.forEach(payment => addLine(lines, cashAccountCode, 0, payment.amount, payment.date));
  }
  if (input.paymentMethod === 'organization-advance' || input.paymentMethod === 'advance-and-personal') {
    advancePayments.forEach(payment => addLine(lines, ADVANCES_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  }
  if (input.paymentMethod === 'officer-personal' || input.paymentMethod === 'advance-and-personal') {
    officerPayments.forEach(payment => addLine(lines, DUE_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
    reimbursements.forEach(payment => {
      addLine(lines, DUE_TO_OFFICERS_ACCOUNT_CODE, payment.amount, 0, payment.date);
      addLine(lines, cashAccountCode, 0, payment.amount, payment.date);
    });
  }
  addLine(lines, MERCHANDISE_PAYABLE_ACCOUNT_CODE, 0, merchandisePayable, input.transactionDate);

  const debits = cents(lines.reduce((sum, line) => sum + line.debit, 0));
  const credits = cents(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debits !== credits) throw new Error('The merchandise acquisition entry is not balanced.');

  return { lines, merchandisePayable, dueToOfficer, advanceUsed, cashPaid };
}
