import { DatedAmountRecord, JournalEntry, JournalLine } from '../types';

export const MERCHANDISE_RECEIVABLE_ACCOUNT_CODE = '1200';
export const DUE_FROM_OFFICERS_ACCOUNT_CODE = '1320';
export const MERCHANDISE_SALES_ACCOUNT_CODE = '4070';
export const COST_OF_SALES_ACCOUNT_CODE = '5240';
export const MERCHANDISE_INVENTORY_ACCOUNT_CODE = '1700';
export const UNEARNED_MERCHANDISE_REVENUE_ACCOUNT_CODE = '2140';
export const MERCHANDISE_REFUND_LIABILITY_ACCOUNT_CODE = '2150';

export type MerchandiseCollectionMethod = 'not-yet-collected' | 'organization-direct' | 'officer-to-remit';

export interface MerchandiseSaleInput {
  totalSales: number;
  inventoryCost: number;
  /** Buyer downpayments received earlier (Unearned Merchandise Revenue) that this sale applies. */
  buyerDownpayment?: number;
  collectionMethod: MerchandiseCollectionMethod;
  transactionDate?: string;
  totalCollected?: number;
  collections?: DatedAmountRecord[];
  totalRemitted?: number;
  remittances?: DatedAmountRecord[];
  cashAccountCode?: string;
}

export interface MerchandiseSalePosting {
  lines: JournalLine[];
  accountsReceivable: number;
  dueFromOfficer: number;
  cashCollected: number;
  /** Collections plus downpayments beyond the total sales: owed back to the buyer. */
  refundLiability: number;
}

export interface MerchandiseBatchBalance {
  entryId: string;
  reference: string;
  date: string;
  item: string;
  purchasedQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  acquisitionCost: number;
  referenceUnitCost: number;
  batch: string;
  costOfSales: number;
  netInventoryBalance: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

function validateAmount(label: string, value: number, allowZero = true): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`);
  return cents(value);
}

function datedAmounts(label: string, records: DatedAmountRecord[] | undefined, fallbackAmount: number, fallbackDate?: string): DatedAmountRecord[] {
  const source = records?.length ? records : fallbackAmount > 0 ? [{ date: fallbackDate || '', amount: fallbackAmount }] : [];
  return source.map(record => ({
    date: record.date || fallbackDate || '',
    amount: validateAmount(label, record.amount),
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

export function buildMerchandiseSalePosting(input: MerchandiseSaleInput): MerchandiseSalePosting {
  const totalSales = validateAmount('Total sales', input.totalSales, false);
  const inventoryCost = validateAmount('Cost of sales', input.inventoryCost, false);
  const buyerDownpayment = validateAmount('Buyer downpayment', input.buyerDownpayment || 0);
  const collections = datedAmounts('Collection', input.collections, input.totalCollected || 0, input.transactionDate);
  const remittances = datedAmounts('Remittance', input.remittances, input.totalRemitted || 0, input.transactionDate);
  const totalCollected = total(collections);
  const totalRemitted = total(remittances);
  const cashAccountCode = input.cashAccountCode || '1010';

  if (input.collectionMethod === 'not-yet-collected' && (totalCollected > 0 || totalRemitted > 0)) throw new Error('A not-yet-collected sale cannot include collections or remittances.');
  if (input.collectionMethod === 'organization-direct' && totalRemitted > 0) throw new Error('Direct organization collections do not use a separate remittance.');
  if (input.collectionMethod === 'officer-to-remit' && totalRemitted > totalCollected) throw new Error('Total remittance cannot exceed what the officer collected.');

  const recognizedCollection = input.collectionMethod === 'not-yet-collected' ? 0 : totalCollected;
  const cashCollected = input.collectionMethod === 'officer-to-remit' ? totalRemitted : recognizedCollection;
  const dueFromOfficer = input.collectionMethod === 'officer-to-remit' ? cents(recognizedCollection - totalRemitted) : 0;
  // Downpayments already cover part of the sale, so only the rest is receivable; anything
  // collected or paid in advance beyond the total sales becomes Refund Liability - Merchandise.
  const accountsReceivable = cents(Math.max(0, totalSales - buyerDownpayment - recognizedCollection));
  const refundLiability = cents(Math.max(0, recognizedCollection + buyerDownpayment - totalSales));

  const lines: JournalLine[] = [];
  if (input.collectionMethod === 'organization-direct') {
    collections.forEach(collection => addLine(lines, cashAccountCode, collection.amount, 0, collection.date));
  } else if (input.collectionMethod === 'officer-to-remit') {
    collections.forEach(collection => addLine(lines, DUE_FROM_OFFICERS_ACCOUNT_CODE, collection.amount, 0, collection.date));
    remittances.forEach(remittance => {
      addLine(lines, cashAccountCode, remittance.amount, 0, remittance.date);
      addLine(lines, DUE_FROM_OFFICERS_ACCOUNT_CODE, 0, remittance.amount, remittance.date);
    });
  }
  addLine(lines, MERCHANDISE_RECEIVABLE_ACCOUNT_CODE, accountsReceivable, 0, input.transactionDate);
  addLine(lines, UNEARNED_MERCHANDISE_REVENUE_ACCOUNT_CODE, buyerDownpayment, 0, input.transactionDate);
  addLine(lines, MERCHANDISE_SALES_ACCOUNT_CODE, 0, totalSales, input.transactionDate);
  addLine(lines, MERCHANDISE_REFUND_LIABILITY_ACCOUNT_CODE, 0, refundLiability, input.transactionDate);
  addLine(lines, COST_OF_SALES_ACCOUNT_CODE, inventoryCost, 0, input.transactionDate);
  addLine(lines, MERCHANDISE_INVENTORY_ACCOUNT_CODE, 0, inventoryCost, input.transactionDate);

  const debits = cents(lines.reduce((sum, line) => sum + line.debit, 0));
  const credits = cents(lines.reduce((sum, line) => sum + line.credit, 0));
  if (debits !== credits) throw new Error('The merchandise sale entry is not balanced.');
  return { lines, accountsReceivable, dueFromOfficer, cashCollected, refundLiability };
}

/** Whether this entry is the acquisition (or carried-forward balance) that put a batch into inventory. */
function isInventoryBatchEntry(entry: JournalEntry): boolean {
  const details = entry.transactionDetails;
  if (entry.reversalOfEntryId || entry.reversedByEntryId || !details || details.merchandiseBatchEntryId) return false;
  if (details.merchandiseQuantity) return true;
  return Boolean(details.merchandiseBatch)
    && !details.customerOrder && !details.customerOrderId
    && entry.lines.some(line => line.accountCode === MERCHANDISE_INVENTORY_ACCOUNT_CODE && line.debit > 0);
}

/**
 * Inventory batches for the sale form and Inventory Summary. A sale is recorded by its cost
 * (the cost of all items sold), so a batch stays available while it still has inventory cost,
 * whether or not a quantity was entered when it was acquired.
 */
export function buildInventoryBatchBalances(entries: JournalEntry[], includeDepleted = false): MerchandiseBatchBalance[] {
  return buildBatchBalances(entries, includeDepleted, isInventoryBatchEntry, batch => batch.netInventoryBalance > 0.005);
}

export function buildMerchandiseBatchBalances(entries: JournalEntry[], includeDepleted = false): MerchandiseBatchBalance[] {
  return buildBatchBalances(entries, includeDepleted,
    entry => Boolean(!entry.reversalOfEntryId && !entry.reversedByEntryId && entry.transactionDetails?.merchandiseQuantity && !entry.transactionDetails?.merchandiseBatchEntryId),
    batch => batch.remainingQuantity > 0);
}

function buildBatchBalances(
  entries: JournalEntry[],
  includeDepleted: boolean,
  isBatchEntry: (entry: JournalEntry) => boolean,
  isAvailable: (batch: MerchandiseBatchBalance) => boolean,
): MerchandiseBatchBalance[] {
  const batches = entries
    .filter(isBatchEntry)
    .map(entry => {
      const purchasedQuantity = entry.transactionDetails?.merchandiseQuantity || 0;
      const soldQuantity = entries
        .filter(sale => !sale.reversalOfEntryId && !sale.reversedByEntryId && sale.transactionDetails?.merchandiseBatchEntryId === entry.id)
        .reduce((sum, sale) => sum + (sale.transactionDetails?.merchandiseQuantitySold || 0), 0);
      const costOfSales = cents(entries
        .filter(sale => !sale.reversalOfEntryId && !sale.reversedByEntryId && sale.transactionDetails?.merchandiseBatchEntryId === entry.id)
        .reduce((sum, sale) => sum + (sale.transactionDetails?.inventoryCost
          || sale.lines.find(line => line.accountCode === COST_OF_SALES_ACCOUNT_CODE)?.debit
          || 0), 0));
      const acquisitionCost = entry.transactionDetails?.carriedInventoryCost ?? (entry.lines.find(line => line.accountCode === MERCHANDISE_INVENTORY_ACCOUNT_CODE)?.debit || 0);
      return {
        entryId: entry.id,
        reference: entry.reference,
        date: entry.date,
        item: entry.transactionDetails?.merchandiseItem || 'Merchandise',
        purchasedQuantity,
        soldQuantity,
        remainingQuantity: Math.max(0, purchasedQuantity - soldQuantity),
        acquisitionCost,
        referenceUnitCost: purchasedQuantity > 0 ? cents(acquisitionCost / purchasedQuantity) : 0,
        batch: entry.transactionDetails?.merchandiseBatch || entry.reference,
        costOfSales,
        netInventoryBalance: Math.max(0, cents(acquisitionCost - costOfSales)),
      };
    });
  return batches
    .filter(batch => includeDepleted || isAvailable(batch))
    .sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}
