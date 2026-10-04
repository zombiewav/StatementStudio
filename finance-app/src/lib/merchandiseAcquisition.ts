import { DatedAmountRecord, JournalLine } from '../types';

export const MERCHANDISE_INVENTORY_ACCOUNT_CODE = '1700';
export const MERCHANDISE_PAYABLE_ACCOUNT_CODE = '2020';
export const ADVANCES_TO_OFFICERS_ACCOUNT_CODE = '1250';
export const ADVANCES_TO_SUPPLIERS_ACCOUNT_CODE = '1270';
export const DUE_TO_OFFICERS_ACCOUNT_CODE = '2050';
export const RECEIVABLE_FROM_SUPPLIER_ACCOUNT_CODE = '1360';

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
  prepaymentAmount?: number;
}

export interface MerchandiseAcquisitionPosting {
  lines: JournalLine[];
  merchandisePayable: number;
  dueToOfficer: number;
  advanceUsed: number;
  cashPaid: number;
  prepaymentApplied: number;
  supplierReceivable: number;
}

export interface MerchandisePrepaymentInput {
  amount: number;
  paymentMethod: Exclude<MerchandisePaymentMethod, 'not-yet-paid'>;
  transactionDate?: string;
  organizationPayments?: DatedAmountRecord[];
  officerPayments?: DatedAmountRecord[];
  advancePayments?: DatedAmountRecord[];
  availableCash?: number;
  availableAdvance?: number;
  cashAccountCode?: string;
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
  const normalizedDebit = cents(debit);
  const normalizedCredit = cents(credit);
  const matchingLine = lines.find(line =>
    line.accountCode === accountCode
    && (line.date || '') === (date || '')
    && (normalizedDebit > 0 ? line.debit > 0 && line.credit === 0 : line.credit > 0 && line.debit === 0)
  );
  if (matchingLine) {
    matchingLine.debit = cents(matchingLine.debit + normalizedDebit);
    matchingLine.credit = cents(matchingLine.credit + normalizedCredit);
    return;
  }
  lines.push({ accountCode, debit: normalizedDebit, credit: normalizedCredit, ...(date ? { date } : {}) });
}

/** Records a supplier downpayment for pre-ordered merchandise. */
export function buildMerchandisePrepaymentPosting(input: MerchandisePrepaymentInput): JournalLine[] {
  const prepayment = requireNonNegative('Supplier downpayment', input.amount);
  if (prepayment <= 0) throw new Error('Supplier downpayment must be greater than zero.');
  const organizationPayments = datedAmounts('Organization payment', input.organizationPayments, 0, input.transactionDate);
  const officerPayments = datedAmounts('Officer payment', input.officerPayments, 0, input.transactionDate);
  const advancePayments = datedAmounts('Advance payment', input.advancePayments, 0, input.transactionDate);
  const organizationAmount = total(organizationPayments);
  const officerAmount = total(officerPayments);
  const advanceAmount = total(advancePayments);
  const funded = cents(organizationAmount + officerAmount + advanceAmount);
  const allowed = input.paymentMethod === 'organization-funds' ? organizationAmount
    : input.paymentMethod === 'officer-personal' ? officerAmount
      : input.paymentMethod === 'organization-advance' ? advanceAmount : funded;
  if (funded !== allowed) throw new Error('Only enter payments for the selected payment method.');
  if (funded !== prepayment) throw new Error('The payment-source total must equal the supplier downpayment.');
  if (organizationAmount > requireNonNegative('Available cash', input.availableCash || 0)) throw new Error('Organization payment cannot exceed the available cash balance.');
  if (advanceAmount > requireNonNegative('Available officer advance', input.availableAdvance || 0)) throw new Error('Payment through an officer advance cannot exceed that officer’s available advance balance.');

  const lines: JournalLine[] = [{ accountCode: ADVANCES_TO_SUPPLIERS_ACCOUNT_CODE, debit: prepayment, credit: 0, ...(input.transactionDate ? { date: input.transactionDate } : {}) }];
  organizationPayments.forEach(payment => addLine(lines, input.cashAccountCode || '1010', 0, payment.amount, payment.date));
  officerPayments.forEach(payment => addLine(lines, DUE_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  advancePayments.forEach(payment => addLine(lines, ADVANCES_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  return lines;
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
  const prepaymentAmount = requireNonNegative('Linked supplier prepayment', input.prepaymentAmount || 0);
  const cashAccountCode = input.cashAccountCode || '1010';
  const purchaseDate = input.transactionDate || '';

  const ensureNotBeforePurchase = (label: string, records: DatedAmountRecord[]) => {
    if (!purchaseDate) return;
    if (records.some(record => record.date && record.date < purchaseDate)) {
      throw new Error(`${label} date cannot be earlier than the Date of Purchase.`);
    }
  };
  ensureNotBeforePurchase('Supplier payment', organizationPayments);
  ensureNotBeforePurchase('Officer payment', officerPayments);
  ensureNotBeforePurchase('Advance payment', advancePayments);
  ensureNotBeforePurchase('Reimbursement', reimbursements);

  let cashPaid = 0;
  let dueToOfficer = 0;
  let advanceUsed = 0;

  if (input.paymentMethod === 'organization-funds') {
    cashPaid = organizationPayment;
  } else if (input.paymentMethod === 'officer-personal') {
    cashPaid = reimbursement;
    if (reimbursement > officerPayment) throw new Error('The reimbursement cannot exceed what the officer paid personally.');
    dueToOfficer = cents(officerPayment - reimbursement);
  } else if (input.paymentMethod === 'organization-advance') {
    advanceUsed = advancePayment;
  } else if (input.paymentMethod === 'advance-and-personal') {
    advanceUsed = advancePayment;
    cashPaid = reimbursement;
    if (reimbursement > officerPayment) throw new Error('The reimbursement cannot exceed what the officer paid personally.');
    dueToOfficer = cents(officerPayment - reimbursement);
  }

  if (advanceUsed > availableAdvance) {
    throw new Error('The advance used cannot exceed the recorded Advances to Officers balance.');
  }
  const lines: JournalLine[] = [];
  addLine(lines, MERCHANDISE_INVENTORY_ACCOUNT_CODE, totalCost, 0, input.transactionDate);
  addLine(lines, ADVANCES_TO_SUPPLIERS_ACCOUNT_CODE, 0, prepaymentAmount, input.transactionDate);

  const purchaseDatePayments = (records: DatedAmountRecord[]) => records.filter(record => !purchaseDate || !record.date || record.date === purchaseDate);
  const laterPayments = (records: DatedAmountRecord[]) => records.filter(record => purchaseDate && record.date && record.date > purchaseDate);

  if (input.paymentMethod === 'organization-funds') {
    purchaseDatePayments(organizationPayments).forEach(payment => addLine(lines, cashAccountCode, 0, payment.amount, payment.date));
  }
  if (input.paymentMethod === 'organization-advance' || input.paymentMethod === 'advance-and-personal') {
    purchaseDatePayments(advancePayments).forEach(payment => addLine(lines, ADVANCES_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  }
  if (input.paymentMethod === 'officer-personal' || input.paymentMethod === 'advance-and-personal') {
    purchaseDatePayments(officerPayments).forEach(payment => addLine(lines, DUE_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  }
  const purchaseDateSupplierPayments = cents(
    total(purchaseDatePayments(organizationPayments))
    + total(purchaseDatePayments(officerPayments))
    + total(purchaseDatePayments(advancePayments))
  );
  const payableAtPurchase = Math.max(0, cents(totalCost - prepaymentAmount - purchaseDateSupplierPayments));
  const supplierReceivableAtPurchase = Math.max(0, cents(prepaymentAmount + purchaseDateSupplierPayments - totalCost));

  let remainingPayable = payableAtPurchase;
  let supplierReceivable = supplierReceivableAtPurchase;
  const applyLaterPayment = (payments: DatedAmountRecord[], sourceAccountCode: string) => {
    laterPayments(payments).forEach(payment => {
      const payableSettled = Math.min(payment.amount, remainingPayable);
      const excessPayment = cents(payment.amount - payableSettled);
      addLine(lines, MERCHANDISE_PAYABLE_ACCOUNT_CODE, payableSettled, 0, payment.date);
      addLine(lines, RECEIVABLE_FROM_SUPPLIER_ACCOUNT_CODE, excessPayment, 0, payment.date);
      addLine(lines, sourceAccountCode, 0, payment.amount, payment.date);
      remainingPayable = cents(remainingPayable - payableSettled);
      supplierReceivable = cents(supplierReceivable + excessPayment);
    });
  };
  if (input.paymentMethod === 'organization-funds') applyLaterPayment(organizationPayments, cashAccountCode);
  if (input.paymentMethod === 'organization-advance' || input.paymentMethod === 'advance-and-personal') applyLaterPayment(advancePayments, ADVANCES_TO_OFFICERS_ACCOUNT_CODE);
  if (input.paymentMethod === 'officer-personal' || input.paymentMethod === 'advance-and-personal') applyLaterPayment(officerPayments, DUE_TO_OFFICERS_ACCOUNT_CODE);
  if (input.paymentMethod === 'officer-personal' || input.paymentMethod === 'advance-and-personal') {
    reimbursements.forEach(payment => {
      addLine(lines, DUE_TO_OFFICERS_ACCOUNT_CODE, payment.amount, 0, payment.date);
      addLine(lines, cashAccountCode, 0, payment.amount, payment.date);
    });
  }
  addLine(lines, MERCHANDISE_PAYABLE_ACCOUNT_CODE, 0, payableAtPurchase, input.transactionDate);
  addLine(lines, RECEIVABLE_FROM_SUPPLIER_ACCOUNT_CODE, supplierReceivableAtPurchase, 0, input.transactionDate);

  const debits = cents(lines.reduce((sum, line) => sum + line.debit, 0));
  const credits = cents(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debits !== credits) throw new Error('The merchandise acquisition entry is not balanced.');

  return { lines, merchandisePayable: remainingPayable, dueToOfficer, advanceUsed, cashPaid, prepaymentApplied: prepaymentAmount, supplierReceivable };
}
