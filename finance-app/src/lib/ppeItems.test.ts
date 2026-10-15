import { describe, expect, it } from 'vitest';
import { buildPpeItemBalances, carryForwardPpeItems } from './ppeItems';
import { JournalEntry } from '../types';

const entry = (id: string, type: string, lines: [string, number, number][], details: Record<string, unknown> = {}, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date: '2026-09-01', description: type, project: 'p', transactionType: type,
  lines: lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit })),
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], ...details } as never, ...extra,
} as JournalEntry);
const buy = (id: string, type: string, code: string, amount: number, quantity?: number) => entry(id, type, [[code, amount, 0], ['1010', 0, amount]], quantity ? { ppeQuantity: quantity } : {});
const depreciate = (id: string, type: string, expense: string, accumulated: string, amount: number) => entry(id, type, [[expense, amount, 0], [accumulated, 0, amount]]);

describe('PPE item balances', () => {
  it('tracks quantity, cost and depreciation per item', () => {
    const balances = buildPpeItemBalances([
      buy('a', 'Purchase of Adaptor', '1513', 100, 2),
      buy('b', 'Purchase of Adaptor', '1513', 60, 1),
      buy('c', 'Purchase of Cabinet', '1651', 500, 1),
      depreciate('d', 'Depreciation of Adaptor', '5090', '1550', 40),
      depreciate('e', 'Depreciation of Cabinet', '5095', '1660', 500),
    ]);
    const adaptor = balances.find(balance => balance.item.code === '1513')!;
    expect(adaptor).toMatchObject({ quantity: 3, cost: 160, accumulatedDepreciation: 40, netBookValue: 120 });
    expect(balances.find(balance => balance.item.code === '1651')).toMatchObject({ netBookValue: 0, accumulatedDepreciation: 500 });
    expect(balances.find(balance => balance.item.code === '1501')).toBeUndefined();
  });

  it('counts a purchase saved without a quantity as one unit, and ignores drafts and reversed entries', () => {
    const balances = buildPpeItemBalances([
      buy('a', 'Purchase of Laptop', '1501', 900),
      { ...buy('b', 'Purchase of Laptop', '1501', 900, 5), isDraft: true },
      { ...buy('c', 'Purchase of Laptop', '1501', 300, 2), reversedByEntryId: 'x' },
    ]);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ quantity: 1, cost: 900 });
  });

  it('treats an opening balance with no carried item detail as one unit', () => {
    const [balance] = buildPpeItemBalances([], { '1513': 250 });
    expect(balance).toMatchObject({ quantity: 1, cost: 250, netBookValue: 250 });
  });

  it('carries each held item into the next semester and keeps counting from there', () => {
    const first = [buy('a', 'Purchase of Adaptor', '1513', 100, 2), depreciate('d', 'Depreciation of Adaptor', '5090', '1550', 30)];
    const carried = carryForwardPpeItems(first, {}, '2027-01-01');
    expect(carried).toHaveLength(1);
    expect(carried[0].lines).toEqual([]);
    expect(carried[0].transactionDetails).toMatchObject({ carriedForward: true, ppeItemCode: '1513', ppeQuantity: 2, ppeCarriedCost: 100, ppeCarriedAccumulated: 30 });
    // The second semester's opening balance for the asset account matches the carried cost, so it is not counted twice.
    const next = buildPpeItemBalances([...carried, buy('n', 'Purchase of Adaptor', '1513', 50, 1), depreciate('m', 'Depreciation of Adaptor', '5090', '1550', 20)], { '1513': 100 });
    expect(next[0]).toMatchObject({ quantity: 3, cost: 150, accumulatedDepreciation: 50, netBookValue: 100 });
  });
});
