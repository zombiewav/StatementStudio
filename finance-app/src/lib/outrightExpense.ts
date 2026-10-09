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
  payableAccountCode?: string;
}

export interface OutrightExpensePosting {
  lines: JournalLine[];
  dueToSupplier: number;
  dueToOfficer: number;
  advanceUsed: number;
  cashPaid: number;
}

export interface DatedJournalBatch {
  date: string;
  lines: JournalLine[];
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/** Split a compound posting into dated entries only when every date group is
 * independently balanced. Unbalanced groups stay together to avoid changing
 * the accounting effect of a transaction. */
export function splitBalancedJournalLinesByDate(lines: JournalLine[], fallbackDate: string): DatedJournalBatch[] {
  if (!lines.length) return [];
  const groups = new Map<string, JournalLine[]>();
  lines.forEach(line => {
    const date = line.date || fallbackDate;
    groups.set(date, [...(groups.get(date) || []), line]);
  });
  if (groups.size <= 1) return [{ date: groups.keys().next().value || fallbackDate, lines }];
  const batches = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, batchLines]) => ({ date, lines: batchLines }));
  const eachBalanced = batches.every(batch => cents(batch.lines.reduce((sum, line) => sum + line.debit, 0)) === cents(batch.lines.reduce((sum, line) => sum + line.credit, 0)));
  return eachBalanced ? batches : [{ date: fallbackDate, lines }];
}

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
  const payableAccountCode = input.payableAccountCode || '2010';
  const isInitial = (record: DatedAmountRecord) => !date || !record.date || record.date === date;
  const lines: JournalLine[] = [];
  addLine(lines, input.expenseAccountCode, totalAmount, 0, date);

  const sources = [
    { records: org, accountCode: input.cashAccountCode || '1010' },
    { records: officer, accountCode: '2050' },
    { records: advance, accountCode: '1250' },
  ];
  sources.forEach(source => source.records.filter(isInitial).forEach(record => addLine(lines, source.accountCode, 0, record.amount, record.date)));

  const initialPaid = cents(total(org.filter(isInitial)) + total(officer.filter(isInitial)) + total(advance.filter(isInitial)));
  const initialPayable = cents(totalAmount - initialPaid);
  addLine(lines, payableAccountCode, 0, initialPayable, date);

  const laterDates = [...new Set(sources.flatMap(source => source.records.filter(record => !isInitial(record)).map(record => record.date)))].sort();
  laterDates.forEach(paymentDate => {
    const batchTotal = cents(sources.reduce((sum, source) => sum + total(source.records.filter(record => !isInitial(record) && record.date === paymentDate)), 0));
    addLine(lines, payableAccountCode, batchTotal, 0, paymentDate);
    sources.forEach(source => source.records.filter(record => !isInitial(record) && record.date === paymentDate)
      .forEach(record => addLine(lines, source.accountCode, 0, record.amount, paymentDate)));
  });

  const dueToSupplier = cents(totalAmount - paid);

  const debitTotal = cents(lines.reduce((sum, line) => sum + line.debit, 0));
  const creditTotal = cents(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debitTotal !== creditTotal) throw new Error('The outright expense entry is not balanced.');
  return { lines, dueToSupplier, dueToOfficer: officerTotal, advanceUsed: advanceTotal, cashPaid: orgTotal };
}
