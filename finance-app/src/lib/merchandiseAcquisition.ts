import { DatedAmountRecord, JournalEntry, JournalLine } from '../types';

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
  advancePayment?: number;
  advancePayments?: DatedAmountRecord[];
  availableAdvance?: number;
  availableCash?: number;
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

export interface MerchandiseAcquisitionBatchPosting {
  date: string;
  lines: JournalLine[];
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

export interface MerchandisePrepaymentTotal {
  entryIds: string[];
  amount: number;
  /** How many of the combined downpayments are still saved drafts. */
  draftCount: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

export function resolveMerchandisePurchaseDate(
  purchaseDate: string,
  payments: readonly { date: string; amount: number | string }[],
  fallbackDate: string,
): string {
  return purchaseDate || payments
    .filter(payment => Number(payment.amount) > 0 && payment.date)
    .map(payment => payment.date)
    .sort()[0] || fallbackDate;
}

function requireNonNegative(label: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be negative.`);
  return cents(value);
}

function datedAmounts(label: string, records: DatedAmountRecord[] | undefined, fallbackAmount: number, fallbackDate?: string): DatedAmountRecord[] {
  const source = records?.length ? records : fallbackAmount > 0 ? [{ date: fallbackDate || '', amount: fallbackAmount }] : [];
  return source.map(record => ({
    date: record.date || fallbackDate || '',
    amount: requireNonNegative(label, record.amount),
    ...(record.later ? { later: true } : {}),
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

const sameText = (left: string | undefined, right: string): boolean => (left || '').trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
const isActiveEntry = (entry: JournalEntry): boolean => !entry.reversalOfEntryId && !entry.reversedByEntryId;
const linkedDownpaymentIds = (entry: JournalEntry): string[] => [
  entry.transactionDetails?.merchandisePrepaymentEntryId,
  ...(entry.transactionDetails?.merchandisePrepaymentEntryIds || []),
].filter((id): id is string => Boolean(id));

/** The active acquisition, if any, that already uses this downpayment. */
export function acquisitionLinkedToDownpayment(downpayment: JournalEntry, entries: JournalEntry[]): JournalEntry | undefined {
  return entries.find(candidate => candidate.id !== downpayment.id && isActiveEntry(candidate) && linkedDownpaymentIds(candidate).includes(downpayment.id));
}

/** Why a downpayment cannot be deleted or reversed, when an acquisition uses it. */
export function downpaymentLinkBlock(downpayment: JournalEntry, entries: JournalEntry[]): string | undefined {
  const acquisition = acquisitionLinkedToDownpayment(downpayment, entries);
  return acquisition
    ? `${downpayment.reference} is already linked to ${acquisition.reference}. Undo or delete that acquisition of merchandise first.`
    : undefined;
}

const downpaymentAmount = (lines: { accountCode: string; debit: number; credit: number }[]): number =>
  cents(lines.filter(line => line.accountCode === ADVANCES_TO_SUPPLIERS_ACCOUNT_CODE).reduce((sum, line) => sum + line.debit - line.credit, 0));

/** Why a linked downpayment's amount cannot change: the acquisition already applied it. */
export function downpaymentAmountChangeBlock(downpayment: JournalEntry, entries: JournalEntry[], nextLines: { accountCode: string; debit: number; credit: number }[]): string | undefined {
  const acquisition = acquisitionLinkedToDownpayment(downpayment, entries);
  if (!acquisition || downpaymentAmount(downpayment.lines) === downpaymentAmount(nextLines)) return undefined;
  return `${downpayment.reference} is already linked to ${acquisition.reference}, so its amount cannot change. Undo or delete that acquisition of merchandise first.`;
}

/** Every downpayment for this merchandise and batch that no acquisition has used yet. Saved drafts count
 * because a draft already sits in the ledger as if it were posted. */
export function aggregateAvailableMerchandisePrepayments(entries: JournalEntry[], item: string, batch: string): MerchandisePrepaymentTotal {
  if (!item.trim() || !batch.trim()) return { entryIds: [], amount: 0, draftCount: 0 };
  const used = new Set(entries.filter(isActiveEntry).flatMap(linkedDownpaymentIds));
  const matching = entries
    .filter(entry => isActiveEntry(entry) && !used.has(entry.id)
      && sameText(entry.transactionDetails?.merchandiseItem, item)
      && sameText(entry.transactionDetails?.merchandiseBatch, batch))
    .map(entry => ({ entry, amount: downpaymentAmount(entry.lines) }))
    // An acquisition of the same batch carries the same item and batch; only real downpayments belong here.
    .filter(candidate => candidate.amount > 0);
  return {
    entryIds: matching.map(candidate => candidate.entry.id),
    amount: cents(matching.reduce((sum, candidate) => sum + candidate.amount, 0)),
    draftCount: matching.filter(candidate => candidate.entry.isDraft).length,
  };
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
  const advancePayments = datedAmounts('Advance used', input.advancePayments, input.advancePayment || 0, input.transactionDate);
  const organizationPayment = total(organizationPayments);
  const officerPayment = total(officerPayments);
  const advancePayment = total(advancePayments);
  const availableAdvance = requireNonNegative('Available officer advance', input.availableAdvance || 0);
  const availableCash = input.availableCash === undefined ? Number.POSITIVE_INFINITY : requireNonNegative('Available cash', input.availableCash);
  const prepaymentAmount = requireNonNegative('Linked supplier prepayment', input.prepaymentAmount || 0);
  const cashAccountCode = input.cashAccountCode || '1010';
  const purchaseDate = input.transactionDate || '';

  const ensureNotBeforePurchase = (label: string, records: DatedAmountRecord[]) => {
    if (!purchaseDate) return;
    if (records.some(record => record.date && record.date < purchaseDate)) {
      throw new Error(`${label} date cannot be earlier than the Date Merchandise Was Received.`);
    }
  };
  ensureNotBeforePurchase('Supplier payment', organizationPayments);
  ensureNotBeforePurchase('Officer payment', officerPayments);
  ensureNotBeforePurchase('Advance payment', advancePayments);
  const allowedOrganization = input.paymentMethod === 'organization-funds' || input.paymentMethod === 'advance-and-personal';
  const allowedOfficer = input.paymentMethod === 'officer-personal' || input.paymentMethod === 'advance-and-personal';
  const allowedAdvance = input.paymentMethod === 'organization-advance' || input.paymentMethod === 'advance-and-personal';
  if (!allowedOrganization && organizationPayment > 0) throw new Error('Only enter organization payments for a payment method that includes organization funds.');
  if (!allowedOfficer && officerPayment > 0) throw new Error('Only enter officer-personal payments for a payment method that includes officer funds.');
  if (!allowedAdvance && advancePayment > 0) throw new Error('Only enter advance payments for a payment method that includes an officer cash advance.');

  const cashPaid = allowedOrganization ? organizationPayment : 0;
  const dueToOfficer = allowedOfficer ? officerPayment : 0;
  const advanceUsed = allowedAdvance ? advancePayment : 0;

  if (cashPaid > availableCash) {
    throw new Error('Organization payments cannot exceed the available cash balance.');
  }

  if (advanceUsed > availableAdvance) {
    throw new Error('The advance used cannot exceed the recorded Advances to Officers balance.');
  }
  const lines: JournalLine[] = [];
  addLine(lines, MERCHANDISE_INVENTORY_ACCOUNT_CODE, totalCost, 0, input.transactionDate);
  addLine(lines, ADVANCES_TO_SUPPLIERS_ACCOUNT_CODE, 0, prepaymentAmount, input.transactionDate);

  // Payments entered under "on a later date" are always their own batch, even
  // when their date was left blank or matches the receipt date.
  const purchaseDatePayments = (records: DatedAmountRecord[]) => records.filter(record => !record.later && (!purchaseDate || !record.date || record.date === purchaseDate));
  const laterPayments = (records: DatedAmountRecord[]) => records.filter(record => record.later || (purchaseDate && record.date && record.date > purchaseDate));

  if (allowedOrganization) {
    purchaseDatePayments(organizationPayments).forEach(payment => addLine(lines, cashAccountCode, 0, payment.amount, payment.date));
  }
  if (allowedAdvance) {
    purchaseDatePayments(advancePayments).forEach(payment => addLine(lines, ADVANCES_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  }
  if (allowedOfficer) {
    purchaseDatePayments(officerPayments).forEach(payment => addLine(lines, DUE_TO_OFFICERS_ACCOUNT_CODE, 0, payment.amount, payment.date));
  }
  const purchaseDateSupplierPayments = cents(
    total(purchaseDatePayments(organizationPayments))
    + total(purchaseDatePayments(officerPayments))
    + total(purchaseDatePayments(advancePayments))
  );
  const payableAtPurchase = Math.max(0, cents(totalCost - prepaymentAmount - purchaseDateSupplierPayments));
  const supplierReceivableAtPurchase = Math.max(0, cents(prepaymentAmount + purchaseDateSupplierPayments - totalCost));

  addLine(lines, MERCHANDISE_PAYABLE_ACCOUNT_CODE, 0, payableAtPurchase, input.transactionDate);
  addLine(lines, RECEIVABLE_FROM_SUPPLIER_ACCOUNT_CODE, supplierReceivableAtPurchase, 0, input.transactionDate);

  // Keep each later payment batch together in the journal: settle the payable
  // (or record supplier receivable) immediately before that batch's funding
  // credits. This makes the displayed entry follow the payment sequence.
  let remainingPayable = payableAtPurchase;
  let supplierReceivable = supplierReceivableAtPurchase;
  const laterPaymentBatches = new Map<string, { accountCode: string; amount: number }[]>();
  const addLaterPayments = (payments: DatedAmountRecord[], accountCode: string) => {
    laterPayments(payments).forEach(payment => {
      const batchDate = payment.date || purchaseDate;
      const batch = laterPaymentBatches.get(batchDate) || [];
      batch.push({ accountCode, amount: payment.amount });
      laterPaymentBatches.set(batchDate, batch);
    });
  };
  if (allowedOrganization) addLaterPayments(organizationPayments, cashAccountCode);
  if (allowedAdvance) addLaterPayments(advancePayments, ADVANCES_TO_OFFICERS_ACCOUNT_CODE);
  if (allowedOfficer) addLaterPayments(officerPayments, DUE_TO_OFFICERS_ACCOUNT_CODE);

  [...laterPaymentBatches.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([paymentDate, payments]) => {
    const batchTotal = cents(payments.reduce((sum, payment) => sum + payment.amount, 0));
    const payableSettled = Math.min(batchTotal, remainingPayable);
    const excessPayment = cents(batchTotal - payableSettled);
    // Built apart from the receipt-date lines so a batch never merges into them.
    const batchLines: JournalLine[] = [];
    addLine(batchLines, MERCHANDISE_PAYABLE_ACCOUNT_CODE, payableSettled, 0, paymentDate);
    addLine(batchLines, RECEIVABLE_FROM_SUPPLIER_ACCOUNT_CODE, excessPayment, 0, paymentDate);
    payments.forEach(payment => addLine(batchLines, payment.accountCode, 0, payment.amount, paymentDate));
    lines.push(...batchLines);
    remainingPayable = cents(remainingPayable - payableSettled);
    supplierReceivable = cents(supplierReceivable + excessPayment);
  });

  const debits = cents(lines.reduce((sum, line) => sum + line.debit, 0));
  const credits = cents(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debits !== credits) throw new Error('The merchandise acquisition entry is not balanced.');

  return { lines, merchandisePayable: remainingPayable, dueToOfficer, advanceUsed, cashPaid, prepaymentApplied: prepaymentAmount, supplierReceivable };
}

/** Splits a received-merchandise posting into one balanced journal entry per
 * payment batch. A batch ends as soon as the running total of its lines
 * balances, so batches that share a date (or have none) still stay separate. */
export function splitMerchandiseAcquisitionPosting(posting: MerchandiseAcquisitionPosting, purchaseDate: string): MerchandiseAcquisitionBatchPosting[] {
  const batches: MerchandiseAcquisitionBatchPosting[] = [];
  let pending: JournalLine[] = [];
  let balance = 0;
  posting.lines.forEach(line => {
    pending.push(line);
    balance = cents(balance + line.debit - line.credit);
    if (balance === 0) {
      batches.push({ date: pending[0].date || purchaseDate, lines: pending });
      pending = [];
    }
  });
  if (pending.length > 0) throw new Error(`Merchandise payment batch on ${pending[0].date || purchaseDate || 'the purchase date'} is not balanced.`);
  return batches;
}

export function buildSupplierReceivableCollectionPosting(amount: number, date: string, availableReceivable: number): JournalLine[] {
  const collected = requireNonNegative('Supplier receivable collection', amount);
  const available = requireNonNegative('Available supplier receivable', availableReceivable);
  if (collected <= 0) throw new Error('Amount collected must be greater than zero.');
  if (collected > available) throw new Error('Collection cannot exceed the outstanding Accounts Receivable - Suppliers balance.');
  return [
    { accountCode: '1010', debit: collected, credit: 0, ...(date ? { date } : {}) },
    { accountCode: RECEIVABLE_FROM_SUPPLIER_ACCOUNT_CODE, debit: 0, credit: collected, ...(date ? { date } : {}) },
  ];
}
