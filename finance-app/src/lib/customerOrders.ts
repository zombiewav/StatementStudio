import { DatedAmountRecord, JournalEntry, JournalLine } from '../types';
import { buildMerchandiseBatchBalances } from './merchandiseSale';

export const CUSTOMER_ADVANCES = '2140';
export const CUSTOMER_REFUNDS = '2150';
const money = (n: number) => Math.round(n * 100) / 100;
const active = (e: JournalEntry) => !e.reversalOfEntryId && !e.reversedByEntryId;
const canonicalMerchandise = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'mugs' ? 'mug' : normalized;
};
export const sameMerchandise = (a: string, b: string) => canonicalMerchandise(a) === canonicalMerchandise(b);

export function customerOrderFinalizationIssues(entry: JournalEntry): string[] {
  const details = entry.transactionDetails;
  const terms = details?.customerOrder;
  if (!terms) return [];
  const issues: string[] = [];
  if (!details.merchandiseItem?.trim()) issues.push('Item or service name is missing');
  if (!details.merchandiseBatch?.trim()) issues.push('Batch or order reference is missing');
  if (!Number.isFinite(terms.total) || terms.total <= 0) issues.push('Total order selling price is missing');
  return issues;
}

export function buildProvisionalCustomerOrderPosting(date: string, collections: DatedAmountRecord[]): JournalLine[] {
  validDate(date);
  const lines: JournalLine[] = [];
  for (const record of collections) {
    validDate(record.date);
    const cash = amount(record.amount, 'Collection');
    if (!cash) continue;
    lines.push({ accountCode: '1010', debit: cash, credit: 0, date: record.date });
    lines.push({ accountCode: CUSTOMER_ADVANCES, debit: 0, credit: cash, date: record.date });
  }
  if (!lines.length) throw new Error('Enter at least one collection amount so the provisional transaction has a ledger effect.');
  return lines;
}

export function customerOrderReversalBlock(entry: JournalEntry, entries: JournalEntry[]): string | undefined {
  if (entry.transactionDetails?.carriedForward) return 'Opening order and inventory details belong to the previous semester.';
  if (entry.reversalOfEntryId && entries.some(e => e.id === entry.reversalOfEntryId && (e.transactionDetails?.customerOrder || e.transactionDetails?.customerOrderId))) return 'Do not reverse an order reversal; record the corrected activity on the order.';
  const id = entry.transactionDetails?.customerOrder ? entry.id : entry.transactionDetails?.customerOrderId;
  if (id && entries.slice(entries.indexOf(entry) + 1).some(e => active(e) && e.transactionDetails?.customerOrderId === id)) return 'Reverse the latest order update first to preserve customer balances.';
  if (entries.some(e => active(e) && e.transactionDetails?.customerOrderId && e.transactionDetails.merchandiseBatchEntryId === entry.id)) return 'Reverse the customer deliveries using this inventory before reversing its purchase.';
  return undefined;
}

export function customerOrderState(root: JournalEntry, entries: JournalEntry[]) {
  const history = entries.filter(e => active(e) && (e.id === root.id || e.transactionDetails?.customerOrderId === root.id));
  const balance = (code: string, credit = false) => money(history.flatMap(e => e.lines).filter(l => l.accountCode === code).reduce((s, l) => s + (credit ? l.credit - l.debit : l.debit - l.credit), 0));
  const opening = root.transactionDetails?.customerOrderOpening;
  const sales = money((opening?.sales || 0) + balance('4070', true));
  return {
    sales, unearned: money((opening?.unearned || 0) + balance(CUSTOMER_ADVANCES, true)), receivable: money((opening?.receivable || 0) + balance('1200')), refundable: money((opening?.refundable || 0) + balance(CUSTOMER_REFUNDS, true)),
    remainingSales: money((root.transactionDetails?.customerOrder?.total || 0) - sales),
    cost: money((opening?.cost || 0) + balance('5240')), collected: money((opening?.collected || 0) + balance('1010')),
    latestDate: history.flatMap(e => [e.date, ...e.lines.map(l => l.date || e.date)]).sort().slice(-1)[0] || root.date,
  };
}

/** Carry only operational details. Ledger balances are carried separately, never reposted. */
export function carryForwardCustomerOrders(entries: JournalEntry[], date: string): JournalEntry[] {
  const orders = entries.filter(e => active(e) && e.transactionDetails?.customerOrder).flatMap(root => {
    const state = customerOrderState(root, entries);
    if (state.remainingSales <= 0 && state.receivable <= 0 && state.refundable <= 0) return [];
    return [{ ...root, date, lines: [], transactionDetails: { ...root.transactionDetails!, carriedForward: true, customerOrderOpening: state } }];
  });
  const neededBatches = buildMerchandiseBatchBalances(entries).filter(batch => orders.some(order =>
    sameMerchandise(batch.item, order.transactionDetails.merchandiseItem || '') && sameMerchandise(batch.batch, order.transactionDetails.merchandiseBatch || '')));
  return [...orders, ...neededBatches.map(batch => {
    const original = entries.find(e => e.id === batch.entryId)!;
    return { ...original, date, lines: [], description: `Beginning Balances — inventory detail: ${batch.item} — ${batch.batch}`, transactionDetails: {
      ...original.transactionDetails!, carriedForward: true, merchandiseQuantity: batch.remainingQuantity, carriedInventoryCost: batch.netInventoryBalance,
    } };
  })];
}

function amount(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return money(value);
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Enter a valid date.');
}

/** Each dated event balances independently; follow-ups never repost prior cash or sales. */
export function buildCustomerOrderPosting(input: {
  root?: JournalEntry; entries: JournalEntry[]; total: number; date: string;
  collections: DatedAmountRecord[]; sales?: number; cost?: number; quantity?: number;
  batchEntryId?: string; refund?: number; kind: 'merchandise' | 'service';
}): JournalLine[] {
  validDate(input.date);
  const total = amount(input.total, 'Order selling price');
  if (!total) throw new Error('Order selling price must be greater than zero.');
  const root = input.root;
  if (root && (!active(root) || !root.transactionDetails?.customerOrder)) throw new Error('Choose an active customer order.');
  const previous = root ? customerOrderState(root, input.entries) : { sales: 0, unearned: 0, receivable: 0, refundable: 0, latestDate: input.date };
  if (root && (total !== root.transactionDetails?.customerOrder?.total || input.kind !== root.transactionDetails.customerOrder.kind)) throw new Error('The saved order terms must be preserved.');
  const sales = amount(input.sales || 0, 'Delivered sales');
  const cost = amount(input.cost || 0, 'Cost of delivered items');
  const refund = amount(input.refund || 0, 'Refund');
  if (!root && (sales || cost || refund)) throw new Error('Save the pre-order before recording delivery.');
  if (money(previous.sales + sales) > total) throw new Error('Delivered sales cannot exceed the remaining order selling price.');
  if (!sales && (cost || input.quantity)) throw new Error('Enter delivered sales before recording quantity or cost.');
  if (sales && input.kind === 'merchandise') {
    const batch = buildMerchandiseBatchBalances(input.entries).find(b => b.entryId === input.batchEntryId);
    if (!batch || !root || !sameMerchandise(batch.item, root.transactionDetails?.merchandiseItem || '') || !sameMerchandise(batch.batch, root.transactionDetails?.merchandiseBatch || '')) throw new Error('Purchase the matching item and batch before recording delivery.');
    if (batch.date > input.date) throw new Error('Delivery cannot precede the inventory purchase.');
    if (!Number.isInteger(input.quantity) || !input.quantity || input.quantity < 1 || input.quantity > batch.remainingQuantity) throw new Error('Delivered units must be within the available batch quantity.');
    if (!cost || cost > batch.netInventoryBalance) throw new Error('Cost of delivered items must be positive and within the remaining batch cost.');
    if (input.quantity === batch.remainingQuantity && cost !== batch.netInventoryBalance) throw new Error('Delivering the final units must release the remaining batch cost.');
    if (input.quantity < batch.remainingQuantity && cost >= batch.netInventoryBalance) throw new Error('Leave inventory cost for the units still on hand.');
  }
  if (input.kind === 'service' && cost) throw new Error('Record service expenses separately; this workflow does not release merchandise inventory for services.');
  const events = input.collections.map(record => {
    validDate(record.date);
    return { date: record.date, cash: amount(record.amount, 'Collection'), delivery: false };
  }).filter(e => e.cash > 0);
  events.push({ date: input.date, cash: 0, delivery: true });
  events.sort((a, b) => a.date.localeCompare(b.date) || Number(a.delivery) - Number(b.delivery));
  if (events.some(e => e.date < previous.latestDate)) throw new Error('Use a date on or after the latest saved order activity.');
  const lines: JournalLine[] = [];
  const post = (code: string, debit: number, credit: number, date: string) => {
    if (debit || credit) lines.push({ accountCode: code, debit: money(debit), credit: money(credit), date });
  };
  let { unearned, receivable, refundable } = previous;
  let delivered = previous.sales;
  for (const event of events) {
    if (event.cash) {
      const againstReceivable = Math.min(event.cash, receivable);
      const advance = Math.min(money(event.cash - againstReceivable), Math.max(0, money(total - delivered - unearned)));
      const excess = money(event.cash - againstReceivable - advance);
      post('1010', event.cash, 0, event.date);
      post('1200', 0, againstReceivable, event.date);
      post(CUSTOMER_ADVANCES, 0, advance, event.date);
      post(CUSTOMER_REFUNDS, 0, excess, event.date);
      receivable = money(receivable - againstReceivable); unearned = money(unearned + advance); refundable = money(refundable + excess);
    }
    if (event.delivery) {
      const release = Math.min(unearned, sales);
      post(CUSTOMER_ADVANCES, release, 0, event.date);
      post('1200', money(sales - release), 0, event.date);
      post('4070', 0, sales, event.date);
      post('5240', cost, 0, event.date);
      post('1700', 0, cost, event.date);
      unearned = money(unearned - release); receivable = money(receivable + sales - release); delivered = money(delivered + sales);
      if (refund > refundable) throw new Error('Refund cannot exceed the refundable excess available on this date.');
      post(CUSTOMER_REFUNDS, refund, 0, event.date);
      post('1010', 0, refund, event.date);
      refundable = money(refundable - refund);
    }
  }
  if (root && !lines.length) throw new Error('Enter a new collection, delivery, or refund.');
  return lines;
}
