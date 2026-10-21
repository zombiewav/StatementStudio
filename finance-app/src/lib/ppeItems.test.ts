import { describe, expect, it } from 'vitest';
import { buildPpeReferences, carryForwardPpeItems, findMatchingPpeReference } from './ppeItems';
import { JournalEntry } from '../types';

const entry = (id: string, type: string, lines: [string, number, number][], details: Record<string, unknown> = {}, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date: '2026-09-01', description: type, project: 'p', transactionType: type,
  lines: lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit })),
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], ...details } as never, ...extra,
} as JournalEntry);
const buy = (id: string, type: string, code: string, quantity: number, unitCost: number, referenceId?: string) =>
  entry(id, type, [[code, quantity * unitCost, 0], ['1010', 0, quantity * unitCost]], { ppeQuantity: quantity, ppeUnitCost: unitCost, ...(referenceId ? { ppeReferenceId: referenceId } : {}) });
const depreciate = (id: string, type: string, expense: string, accumulated: string, amount: number, referenceId?: string) =>
  entry(id, type, [[expense, amount, 0], [accumulated, 0, amount]], referenceId ? { ppeReferenceId: referenceId } : {});

describe('PPE Item References', () => {
  it('keeps chairs at different unit costs as separate references (the client scenarios)', () => {
    const entries = [buy('a', 'Purchase Chairs', '1652', 2, 250, 'r1'), buy('b', 'Purchase Chairs', '1652', 1, 250, 'r1'), buy('c', 'Purchase Chairs', '1652', 1, 300, 'r2')];
    const references = buildPpeReferences(entries);
    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({ referenceId: 'r1', quantity: 3, unitCost: 250, cost: 750, accumulatedDepreciation: 0 });
    expect(references[1]).toMatchObject({ referenceId: 'r2', quantity: 1, unitCost: 300, cost: 300 });
  });

  it('matches a new purchase to a reference with the same item and unit cost and no depreciation yet', () => {
    const entries = [buy('a', 'Purchase Chairs', '1652', 2, 250, 'r1'), buy('c', 'Purchase Chairs', '1652', 1, 300, 'r2')];
    const references = buildPpeReferences(entries);
    expect(findMatchingPpeReference(references, '1652', 250)?.referenceId).toBe('r1');
    expect(findMatchingPpeReference(references, '1652', 300)?.referenceId).toBe('r2');
    expect(findMatchingPpeReference(references, '1652', 275)).toBeUndefined();
    expect(findMatchingPpeReference(references, '1651', 250)).toBeUndefined();
    // Once a reference has depreciation, units bought later have a different depreciation history.
    const depreciated = buildPpeReferences([...entries, depreciate('d', 'Depreciation of Chairs', '5095', '1660', 50, 'r1')]);
    expect(findMatchingPpeReference(depreciated, '1652', 250)).toBeUndefined();
  });

  it('charges depreciation to the selected reference only', () => {
    const references = buildPpeReferences([
      buy('a', 'Purchase Chairs', '1652', 3, 250, 'r1'), buy('c', 'Purchase Chairs', '1652', 1, 300, 'r2'),
      depreciate('d', 'Depreciation of Chairs', '5095', '1660', 150, 'r1'),
    ]);
    expect(references.find(reference => reference.referenceId === 'r1')).toMatchObject({ accumulatedDepreciation: 150, netBookValue: 600 });
    expect(references.find(reference => reference.referenceId === 'r2')).toMatchObject({ accumulatedDepreciation: 0, netBookValue: 300 });
  });

  it('takes a retirement off the selected reference only and drops a reference with nothing left', () => {
    const retire = (id: string, referenceId: string, quantity: number, cost: number, accumulated: number) => entry(id, 'Retirement of PPE', [['1660', accumulated, 0], ['1652', 0, cost]],
      { ppeItemCode: '1652', ppeReferenceId: referenceId, ppeRetiredQuantity: quantity, ppeRetiredCost: cost, ppeRetiredAccumulated: accumulated });
    const base = [buy('a', 'Purchase Chairs', '1652', 3, 250, 'r1'), buy('c', 'Purchase Chairs', '1652', 1, 300, 'r2'), depreciate('d', 'Depreciation of Chairs', '5095', '1660', 150, 'r1')];
    const partly = buildPpeReferences([...base, retire('x', 'r1', 1, 250, 50)]);
    expect(partly.find(reference => reference.referenceId === 'r1')).toMatchObject({ quantity: 2, cost: 500, accumulatedDepreciation: 100 });
    expect(partly.find(reference => reference.referenceId === 'r2')).toMatchObject({ quantity: 1, cost: 300 });
    const gone = buildPpeReferences([...base, retire('x', 'r2', 1, 300, 0)]);
    expect(gone.map(reference => reference.referenceId)).toEqual(['r1']);
  });

  it('treats a purchase saved without a unit cost as its own reference, unit cost = cost / quantity', () => {
    const legacy = entry('old', 'Purchase of Adaptor', [['1513', 200, 0], ['1010', 0, 200]], { ppeQuantity: 2 });
    const none = entry('older', 'Purchase of Laptop', [['1501', 900, 0], ['1010', 0, 900]]);
    const references = buildPpeReferences([legacy, none]);
    expect(references.find(reference => reference.item.code === '1513')).toMatchObject({ referenceId: 'old', quantity: 2, unitCost: 100 });
    expect(references.find(reference => reference.item.code === '1501')).toMatchObject({ quantity: 1, unitCost: 900 });
  });

  it('charges depreciation recorded without a reference to the item\'s oldest reference, and ignores reversed entries', () => {
    const references = buildPpeReferences([
      buy('a', 'Purchase Chairs', '1652', 1, 250, 'r1'), buy('c', 'Purchase Chairs', '1652', 1, 300, 'r2'),
      depreciate('d', 'Depreciation of Chairs', '5095', '1660', 40),
      { ...buy('y', 'Purchase Chairs', '1652', 9, 100, 'r4'), reversedByEntryId: 'z' },
    ]);
    expect(references.map(reference => reference.referenceId)).toEqual(['r1', 'r2']);
    expect(references[0].accumulatedDepreciation).toBe(40);
  });

  it('counts saved drafts (a draft purchase can be depreciated, a draft depreciation lowers the balance), unless asked for posted entries only', () => {
    const entries = [
      { ...buy('x', 'Purchase Chairs', '1652', 2, 100, 'r3'), isDraft: true },
      { ...depreciate('d', 'Depreciation of Chairs', '5095', '1660', 60, 'r3'), isDraft: true },
    ];
    expect(buildPpeReferences(entries)).toMatchObject([{ referenceId: 'r3', quantity: 2, cost: 200, accumulatedDepreciation: 60, netBookValue: 140 }]);
    expect(buildPpeReferences(entries, {}, { includeDrafts: false })).toEqual([]);
  });

  it('treats an opening balance with no carried detail as one unit', () => {
    const [reference] = buildPpeReferences([], { '1513': 250 });
    expect(reference).toMatchObject({ quantity: 1, unitCost: 250, cost: 250, netBookValue: 250 });
  });

  it('carries each reference into the next semester and keeps counting from there', () => {
    const first = [buy('a', 'Purchase Chairs', '1652', 2, 250, 'r1'), buy('c', 'Purchase Chairs', '1652', 1, 300, 'r2'), depreciate('d', 'Depreciation of Chairs', '5095', '1660', 30, 'r1')];
    const carried = carryForwardPpeItems(first, {}, '2027-01-01');
    expect(carried).toHaveLength(2);
    expect(carried[0].lines).toEqual([]);
    expect(carried[0].transactionDetails).toMatchObject({ carriedForward: true, ppeReferenceId: 'r1', ppeQuantity: 2, ppeUnitCost: 250, ppeCarriedCost: 500, ppeCarriedAccumulated: 30 });
    // The opening balance of the asset account equals the carried cost, so nothing is counted twice, and a later purchase joins r2.
    const next = buildPpeReferences([...carried, buy('n', 'Purchase Chairs', '1652', 1, 300, 'r2'), depreciate('m', 'Depreciation of Chairs', '5095', '1660', 20, 'r1')], { '1652': 800 });
    expect(next.find(reference => reference.referenceId === 'r1')).toMatchObject({ quantity: 2, cost: 500, accumulatedDepreciation: 50 });
    expect(next.find(reference => reference.referenceId === 'r2')).toMatchObject({ quantity: 2, cost: 600 });
    expect(next).toHaveLength(2);
  });
});
