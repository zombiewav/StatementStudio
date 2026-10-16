import { JournalLine } from '../types';

// Merchandise Transactions has three "collection" types that share one form: cash comes in against a receivable
// and the collection can never exceed that receivable's ledger balance (Dr Cash on Hand / Cr the receivable).
export interface ReceivableCollectionKind {
  creditCode: '1360' | '1320' | '1200';
  title: string;
  /** What the account is called in the limit messages. */
  accountLabel: string;
  amountLabel: string;
  intro: string;
  journalNote: string;
  outstandingLabel: string;
}

export const RECEIVABLE_COLLECTION_KINDS: ReceivableCollectionKind[] = [
  {
    creditCode: '1360', title: 'Collection of Receivables from Suppliers', accountLabel: 'Accounts Receivable - Suppliers', amountLabel: 'Amount collected',
    intro: 'Record cash returned or collected from suppliers against prior excess payments.',
    journalNote: 'Journal entry: Debit Cash on Hand, Credit Accounts Receivable - Suppliers. This balance is linked to the Accounts Receivable - Suppliers account in the General Ledger; the collection cannot exceed it.',
    outstandingLabel: 'Outstanding receivable (ledger balance)',
  },
  {
    creditCode: '1320', title: 'Collection of Receivables from Officers - Merchandise', accountLabel: 'Due from Officers', amountLabel: 'Amount collected',
    intro: 'Record cash remitted by an officer who collected merchandise payments on behalf of the organization.',
    journalNote: 'Journal entry: Debit Cash on Hand, Credit Due from Officers. This balance is linked to the Due from Officers account in the General Ledger; the collection cannot exceed it.',
    outstandingLabel: 'Outstanding Due from Officers (ledger balance)',
  },
  {
    creditCode: '1200', title: 'Collection of Unpaid Sold Merchandise', accountLabel: 'Accounts Receivable - Merchandise', amountLabel: 'How much was collected?',
    intro: 'Record cash collected from buyers for merchandise that was sold earlier and is still unpaid.',
    journalNote: 'Journal entry: Debit Cash on Hand, Credit Accounts Receivable - Merchandise. The amount is linked to what is still receivable from buyers and cannot exceed it.',
    outstandingLabel: 'Still receivable from buyers (ledger balance)',
  },
];

/** The collection kind a type's accounts describe (Dr Cash on Hand / Cr receivable), if any. */
export const receivableCollectionKind = (debitCode: string | undefined, creditCode: string | undefined): ReceivableCollectionKind | undefined =>
  debitCode === '1010' ? RECEIVABLE_COLLECTION_KINDS.find(kind => kind.creditCode === creditCode) : undefined;

export const receivableCollectionLimitMessage = (kind: ReceivableCollectionKind, outstanding: number, formatCurrency: (value: number) => string): string =>
  `Collection cannot exceed the outstanding ${kind.accountLabel} balance of ${formatCurrency(outstanding)}.`;

const cents = (value: number) => Math.round(value * 100) / 100;

export function buildReceivableCollectionPosting(kind: ReceivableCollectionKind, amount: number, date: string, available: number): JournalLine[] {
  const collected = cents(amount);
  if (!(collected > 0)) throw new Error('Amount collected must be greater than zero.');
  if (collected > cents(Math.max(0, available))) throw new Error(`Collection cannot exceed the outstanding ${kind.accountLabel} balance.`);
  return [
    { accountCode: '1010', debit: collected, credit: 0, ...(date ? { date } : {}) },
    { accountCode: kind.creditCode, debit: 0, credit: collected, ...(date ? { date } : {}) },
  ];
}
