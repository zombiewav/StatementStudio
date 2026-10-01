import { describe, expect, it } from 'vitest';
import { JournalEntry, JournalLine } from '../types';
import { buildCustomerOrderPosting as build, buildProvisionalCustomerOrderPosting, carryForwardCustomerOrders, customerOrderFinalizationIssues, customerOrderReversalBlock, customerOrderState } from './customerOrders';
import { buildMerchandiseBatchBalances } from './merchandiseSale';
import { computeTransactionReviewStates } from './reviewEngine';

const date = '2026-08-01';
const base = { entries: [] as JournalEntry[], total: 1000, date, collections: [], kind: 'merchandise' as const };
const root: JournalEntry = { id: 'order', reference: 'JE-0001', date, description: 'Customer pre-order', project: 'General Fund Operations',
  lines: build({ ...base, collections: [{ date, amount: 600 }] }),
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], customerOrder: { total: 1000, estimatedCost: 700, kind: 'merchandise' }, merchandiseItem: 'Lanyard', merchandiseBatch: 'Batch 1' } };
const purchase: JournalEntry = { id: 'purchase', reference: 'JE-0002', date, description: 'Inventory purchase', project: root.project,
  lines: [{ accountCode: '1700', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }],
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], merchandiseItem: 'Lanyard', merchandiseBatch: 'Batch 1', merchandiseQuantity: 10 } };
const delivery = { ...base, root, entries: [root, purchase], date: '2026-08-02', sales: 1000, cost: 700, quantity: 10, batchEntryId: purchase.id };
const followup = (lines: JournalLine[], id = 'delivery', details = {}): JournalEntry => ({ id, reference: id, date: '2026-08-02', description: 'Order update', project: root.project, settlesEntryId: root.id, lines,
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], customerOrderId: root.id, ...details } });
const net = (lines: JournalLine[], code: string) => lines.filter(l => l.accountCode === code).reduce((sum, l) => sum + l.debit - l.credit, 0);

describe('customer pre-orders and deliveries', () => {
  it('posts known cash provisionally while listing unavailable source details', () => {
    expect(buildProvisionalCustomerOrderPosting(date, [{ date, amount: 250 }])).toEqual([
      { accountCode: '1010', debit: 250, credit: 0, date },
      { accountCode: '2140', debit: 0, credit: 250, date },
    ]);
    const provisional = { ...root, transactionDetails: { ...root.transactionDetails!, merchandiseItem: '', merchandiseBatch: '', customerOrder: { total: 0, estimatedCost: 0, kind: 'merchandise' as const } } };
    expect(customerOrderFinalizationIssues(provisional)).toEqual(['Item or service name is missing', 'Batch or order reference is missing', 'Total order selling price is missing']);
    expect(computeTransactionReviewStates([provisional], [])[0].missing).toEqual([
      'Transaction needs final review and posting', 'Item or service name is missing', 'Batch or order reference is missing', 'Total order selling price is missing',
    ]);
  });
  it('holds the deposit as a liability, without revenue or inventory movements', () => {
    expect(root.lines).toEqual([{ accountCode: '1010', debit: 600, credit: 0, date }, { accountCode: '2140', debit: 0, credit: 600, date }]);
  });
  it('recognizes full delivered revenue and unpaid balance immediately, separately from cost', () => {
    const lines = build(delivery);
    expect(net(lines, '2140')).toBe(600);
    expect(net(lines, '1200')).toBe(400);
    expect(net(lines, '4070')).toBe(-1000);
    expect(net(lines, '5240')).toBe(700);
    expect(net(lines, '1700')).toBe(-700);
    expect(net(lines, '1010')).toBe(0);
  });
  it('settles the receivable with later cash without recognizing revenue twice', () => {
    const sale = followup(build(delivery));
    const lines = build({ ...base, root, entries: [root, purchase, sale], date: '2026-08-03', collections: [{ date: '2026-08-03', amount: 400 }] });
    expect(net(lines, '1200')).toBe(-400);
    expect(net(lines, '1010')).toBe(400);
    expect(net(lines, '4070')).toBe(0);
    expect(customerOrderState(root, [root, sale, followup(lines, 'collection')])).toMatchObject({ sales: 1000, receivable: 0, unearned: 0, collected: 1000 });
  });
  it('retains the unused deposit and unsold stock after partial delivery', () => {
    const lines = build({ ...delivery, sales: 400, cost: 280, quantity: 4 });
    const sale = followup(lines, 'partial', { merchandiseBatchEntryId: purchase.id, merchandiseQuantitySold: 4, inventoryCost: 280 });
    expect(customerOrderState(root, [root, sale])).toMatchObject({ sales: 400, remainingSales: 600, unearned: 200, receivable: 0 });
    expect(buildMerchandiseBatchBalances([root, purchase, sale])[0]).toMatchObject({ remainingQuantity: 6, netInventoryBalance: 420 });
  });
  it('splits a collection across receivable, future delivery, and refundable excess', () => {
    const sale = followup(build({ ...delivery, sales: 800, cost: 560, quantity: 8 }));
    const lines = build({ ...base, root, entries: [root, sale], date: '2026-08-03', collections: [{ date: '2026-08-03', amount: 500 }] });
    expect(net(lines, '1200')).toBe(-200);
    expect(net(lines, '2140')).toBe(-200);
    expect(net(lines, '2150')).toBe(-100);
  });
  it('does not treat payments exceeding just the original deposit as refundable', () => {
    const lines = build({ ...base, root, entries: [root], date: '2026-08-02', collections: [{ date: '2026-08-02', amount: 300 }] });
    expect(net(lines, '2140')).toBe(-300);
    expect(net(lines, '2150')).toBe(0);
  });
  it('refunds excess without reducing sales', () => {
    const excess = followup(build({ ...base, root, entries: [root], date: '2026-08-02', collections: [{ date: '2026-08-02', amount: 500 }] }));
    const lines = build({ ...base, root, entries: [root, excess], date: '2026-08-03', refund: 100 });
    expect(net(lines, '2150')).toBe(100);
    expect(net(lines, '1010')).toBe(-100);
    expect(net(lines, '4070')).toBe(0);
    expect(() => build({ ...base, root, entries: [root, excess], date: '2026-08-03', refund: 101 })).toThrow(/Refund/);
  });
  it('balances each date independently for collections before and after delivery', () => {
    const lines = build({ ...delivery, collections: [{ date: '2026-08-03', amount: 200 }, { date: '2026-08-01', amount: 100 }] });
    for (const day of new Set(lines.map(l => l.date))) expect(lines.filter(l => l.date === day).reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
    expect(lines.filter(l => l.date === '2026-08-03' && l.accountCode === '1200')[0].credit).toBe(200);
  });
  it('permits collections without inventory but blocks deliveries and mismatched batches', () => {
    expect(build({ ...base, root, entries: [root], date: '2026-08-02', collections: [{ date: '2026-08-02', amount: 50 }] })).toHaveLength(2);
    expect(() => build({ ...delivery, entries: [root] })).toThrow(/matching item and batch/);
    expect(() => build({ ...delivery, entries: [root, { ...purchase, transactionDetails: { ...purchase.transactionDetails!, merchandiseBatch: 'Batch 2' } }] })).toThrow(/matching item and batch/);
  });
  it('validates quantity, inventory cost, remaining sales, and acquisition date', () => {
    expect(() => build({ ...delivery, quantity: 11 })).toThrow(/units/);
    expect(() => build({ ...delivery, cost: 701 })).toThrow(/remaining batch cost/);
    expect(() => build({ ...delivery, cost: 699 })).toThrow(/final units/);
    expect(() => build({ ...delivery, quantity: 9 })).toThrow(/Leave inventory cost/);
    expect(() => build({ ...delivery, sales: 1001 })).toThrow(/remaining order/);
    expect(() => build({ ...delivery, entries: [root, { ...purchase, date: '2026-08-03' }] })).toThrow(/precede/);
  });
  it('recognizes services without merchandise inventory', () => {
    const service = { ...root, transactionDetails: { ...root.transactionDetails!, customerOrder: { total: 1000, estimatedCost: 0, kind: 'service' as const } } };
    const lines = build({ ...base, root: service, entries: [service], kind: 'service', date: '2026-08-02', sales: 1000 });
    expect(net(lines, '4070')).toBe(-1000);
    expect(net(lines, '1700')).toBe(0);
  });
  it('rejects invalid amounts, empty updates, invalid dates and retroactive activity', () => {
    expect(() => build({ ...base, total: NaN })).toThrow(/selling price/);
    expect(() => build({ ...base, date: '2026-02-30' })).toThrow(/valid date/);
    expect(() => build({ ...base, root, entries: [root] })).toThrow(/new collection/);
    expect(() => build({ ...base, collections: [{ date, amount: -1 }] })).toThrow(/Collection/);
    expect(() => build({ ...delivery, date: '2026-07-31' })).toThrow();
  });
  it('shows one standard Review item, incomplete until delivery, collection and refund finish', () => {
    const sale = followup(build(delivery));
    expect(computeTransactionReviewStates([root, sale], [])[0]).toMatchObject({ status: 'incomplete', missing: ['Transaction needs final review and posting', 'Due from customer: 400'] });
    const payment = followup(build({ ...base, root, entries: [root, sale], date: '2026-08-03', collections: [{ date: '2026-08-03', amount: 450 }] }), 'cash');
    expect(computeTransactionReviewStates([root, sale, payment], [])).toHaveLength(1);
    expect(computeTransactionReviewStates([root, sale, payment], [])[0].missing).toEqual(['Transaction needs final review and posting', 'Due to customer (refundable excess): 50']);
    const refund = followup(build({ ...base, root, entries: [root, sale, payment], date: '2026-08-04', refund: 50 }), 'refund');
    expect(computeTransactionReviewStates([root, sale, payment, refund], [])[0].status).toBe('incomplete');
    const finalized = { ...root, transactionDetails: { ...root.transactionDetails!, reviewFinalized: true } };
    expect(computeTransactionReviewStates([finalized, sale, payment, refund], [])[0].status).toBe('complete');
  });
  it('restores customer and inventory balances after reversing the latest delivery', () => {
    const sale = followup(build(delivery), 'sale', { merchandiseBatchEntryId: purchase.id, merchandiseQuantitySold: 10, inventoryCost: 700 });
    const entries = [root, purchase, { ...sale, reversedByEntryId: 'reversal' }, { ...sale, id: 'reversal', reversalOfEntryId: sale.id, lines: sale.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })) }];
    expect(customerOrderState(root, entries)).toMatchObject({ sales: 0, unearned: 600, receivable: 0 });
    expect(buildMerchandiseBatchBalances(entries)[0].remainingQuantity).toBe(10);
    expect(customerOrderReversalBlock(root, [root, sale])).toMatch(/latest/);
    expect(customerOrderReversalBlock(purchase, [root, purchase, sale])).toMatch(/deliveries/);
    expect(customerOrderReversalBlock(sale, [root, purchase, sale])).toBeUndefined();
  });
  it('carries open order details and matching stock without reposting prior-period accounting', () => {
    const sale = followup(build({ ...delivery, sales: 400, cost: 280, quantity: 4 }), 'partial', { merchandiseBatchEntryId: purchase.id, merchandiseQuantitySold: 4, inventoryCost: 280 });
    const next = carryForwardCustomerOrders([root, purchase, sale], '2027-01-01');
    expect(next.every(e => e.lines.length === 0)).toBe(true);
    const carried = next.find(e => e.id === root.id)!;
    expect(customerOrderState(carried, next)).toMatchObject({ sales: 400, unearned: 200, remainingSales: 600 });
    expect(buildMerchandiseBatchBalances(next)[0]).toMatchObject({ remainingQuantity: 6, netInventoryBalance: 420 });
    const lines = build({ ...base, root: carried, entries: next, date: '2027-01-02', sales: 600, quantity: 6, cost: 420, batchEntryId: purchase.id });
    expect(net(lines, '4070')).toBe(-600);
    expect(net(lines, '2140')).toBe(200);
    expect(net(lines, '1200')).toBe(400);
    expect(customerOrderReversalBlock(carried, next)).toMatch(/previous semester/);
  });
});
