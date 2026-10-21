import { describe, expect, it } from 'vitest';
import { Account, JournalEntry, SemesterAdjustments } from '../types';
import { adjustmentSemesterKey, cashAdjustment, checkBankAndEwallet, checkPpeClassification, computeOtherAdjustments, ppeGroupStatuses, prepaidAdjustmentItems } from './otherAdjustments';

const accounts: Account[] = [
  { code: '1010', name: 'Cash', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1015', name: 'Cash in Bank', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1285', name: 'Supplies and Materials', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1260', name: 'Prepaid Expenses', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
];
const entry = (id: string, type: string, lines: [string, number, number][], details: Record<string, unknown> = {}, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date: '2026-10-05', description: type, project: 'p', transactionType: type,
  lines: lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit })),
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], ...details } as never, ...extra,
} as JournalEntry);
const buyLaptops = (id: string, quantity: number, unitCost: number, referenceId: string) =>
  entry(id, 'Purchase of Laptop', [['1501', quantity * unitCost, 0], ['1010', 0, quantity * unitCost]], { ppeQuantity: quantity, ppeUnitCost: unitCost, ppeReferenceId: referenceId });
const depreciate = (id: string, amount: number, referenceId: string, date = '2026-11-20') =>
  entry(id, 'Depreciation of Laptop', [['5090', amount, 0], ['1550', 0, amount]], { ppeReferenceId: referenceId }, { date });
const retire = (id: string, referenceId: string, quantity: number, cost: number, accumulated: number, date = '2026-11-25') =>
  entry(id, 'Retirement of PPE', [['1550', accumulated, 0], ['1501', 0, cost]], { ppeItemCode: '1501', ppeReferenceId: referenceId, ppeRetiredQuantity: quantity, ppeRetiredCost: cost, ppeRetiredAccumulated: accumulated }, { date });
const status = (entries: JournalEntry[], record?: SemesterAdjustments) => ppeGroupStatuses(entries, {}, '1st Semester', 2026, record);
const answers = (continueQuantity: number, nextYearQuantity: number, retireQuantity: number) => ({ continueQuantity, nextYearQuantity, retireQuantity });

describe('classifying a PPE group (the three questions)', () => {
  const input = (a: string, b: string, c: string) => ({ continueQuantity: a, nextYearQuantity: b, retireQuantity: c });

  it('accepts answers that add up exactly to the available quantity', () => {
    expect(checkPpeClassification(3, input('1', '1', '1'))).toMatchObject({ total: 3, error: '', quantities: answers(1, 1, 1) });
    expect(checkPpeClassification(3, input('3', '', ''))).toMatchObject({ total: 3, error: '' });
  });

  it('refuses a total below or above the available quantity', () => {
    expect(checkPpeClassification(3, input('1', '1', '0')).error).toBe('The total (2) cannot be less than the available quantity of 3.');
    expect(checkPpeClassification(3, input('2', '1', '1')).error).toBe('The total (4) cannot exceed the available quantity of 3.');
  });

  it('refuses negative, fractional and oversized quantities', () => {
    expect(checkPpeClassification(3, input('-1', '2', '2')).error).toBe('Quantities cannot be negative.');
    expect(checkPpeClassification(3, input('1.5', '1', '0.5')).error).toBe('Quantities must be whole numbers.');
    expect(checkPpeClassification(3, input('4', '0', '0')).error).toBe('A quantity cannot be greater than the available quantity of 3.');
  });

  it('counts units already retired this semester and does not let the third answer drop below them', () => {
    expect(checkPpeClassification(2, input('1', '0', '1'), 1).error).toBe('');
    expect(checkPpeClassification(2, input('2', '0', '0'), 1).error).toContain('already retired');
  });
});

describe('PPE groups outstanding in Other Adjustments', () => {
  const laptops = [buyLaptops('a', 3, 10000, 'g1'), buyLaptops('b', 2, 8000, 'g2')];

  it('lists each item at each amount per unit as its own group, and each needs classifying', () => {
    const groups = status(laptops);
    expect(groups.map(group => [group.groupNumber, group.reference.unitCost, group.reference.quantity])).toEqual([[1, 8000, 2], [2, 10000, 3]]);
    expect(groups.every(group => group.needsClassification && group.outstanding)).toBe(true);
  });

  it('does not list an item with nothing left', () => {
    expect(status([])).toEqual([]);
    const gone = status([buyLaptops('a', 1, 500, 'g1'), retire('r', 'g1', 1, 500, 0)]);
    expect(gone).toEqual([]);
  });

  it('keeps a group outstanding until its depreciation is recorded, when units are kept and the Net Book Value is above zero', () => {
    const record = { ppe: { g1: answers(2, 1, 0), g2: answers(2, 0, 0) } };
    const before = status(laptops, record);
    expect(before.every(group => group.depreciationPending && group.outstanding)).toBe(true);
    const after = status([...laptops, depreciate('d1', 1000, 'g1'), depreciate('d2', 500, 'g2')], record);
    expect(after.every(group => !group.outstanding)).toBe(true);
  });

  it('needs no depreciation for a group that is already fully depreciated', () => {
    const record = { ppe: { g1: answers(3, 0, 0) } };
    const groups = status([buyLaptops('a', 3, 10000, 'g1'), depreciate('d', 30000, 'g1', '2026-08-30')], record);
    // Fully depreciated: Net Book Value is zero, so classifying it is all that is asked.
    expect(groups[0].reference.netBookValue).toBe(0);
    expect(groups[0]).toMatchObject({ depreciationPending: false, outstanding: false });
  });

  it('counts depreciation recorded in an earlier semester as no answer for this one', () => {
    const record = { ppe: { g1: answers(3, 0, 0) } };
    const groups = status([buyLaptops('a', 3, 10000, 'g1'), depreciate('d', 3000, 'g1', '2026-03-15')], record);
    expect(groups[0].depreciationPending).toBe(true);
  });

  it('keeps retirement pending until the units named in the third answer are retired, then moves on to depreciation', () => {
    const record = { ppe: { g1: answers(1, 0, 2) } };
    const pending = status([buyLaptops('a', 3, 10000, 'g1')], record)[0];
    expect(pending).toMatchObject({ retirementPending: 2, depreciationPending: true, outstanding: true });
    const partly = status([buyLaptops('a', 3, 10000, 'g1'), retire('r1', 'g1', 1, 10000, 0)], record)[0];
    expect(partly).toMatchObject({ retiredThisSemester: 1, retirementPending: 1, outstanding: true });
    const retired = status([buyLaptops('a', 3, 10000, 'g1'), retire('r1', 'g1', 2, 20000, 0), depreciate('d', 1000, 'g1')], record)[0];
    expect(retired).toMatchObject({ retirementPending: 0, depreciationPending: false, outstanding: false });
    expect(retired.reference.quantity).toBe(1);
  });

  it('asks for the classification again when the units no longer add up (more bought later)', () => {
    const record = { ppe: { g1: answers(2, 1, 0) } };
    expect(status([buyLaptops('a', 3, 10000, 'g1')], record)[0].needsClassification).toBe(false);
    expect(status([buyLaptops('a', 3, 10000, 'g1'), buyLaptops('b', 1, 10000, 'g1')], record)[0].needsClassification).toBe(true);
  });

  it('counts a draft retirement or depreciation as done (statements are still held back by drafts)', () => {
    const record = { ppe: { g1: answers(1, 0, 1) } };
    const entries = [buyLaptops('a', 2, 10000, 'g1'), retire('r', 'g1', 1, 10000, 0), depreciate('d', 500, 'g1')].map(item => item.id === 'a' ? item : { ...item, isDraft: true });
    expect(status(entries, record)[0].outstanding).toBe(false);
  });
});

describe('prepaid assets in Other Adjustments', () => {
  const purchase = entry('staples', 'Purchase of Prepaid Assets', [['1285', 100, 0], ['1010', 0, 100]], { prepaidAssetItem: 'Staples', prepaidAssetCategory: 'supplies' });
  const key = adjustmentSemesterKey(2026, '1st Semester');

  it('lists an unused prepaid purchase until it is marked updated for the semester', () => {
    const open = prepaidAdjustmentItems([purchase], accounts, { '1285': 100 }, key);
    expect(open).toEqual([expect.objectContaining({ entryId: 'staples', label: 'Staples', remaining: 100, updated: false })]);
    const done = { ...purchase, transactionDetails: { ...purchase.transactionDetails!, prepaidSemesterFinalized: key } };
    expect(prepaidAdjustmentItems([done], accounts, { '1285': 100 }, key)[0].updated).toBe(true);
  });

  it('nets a consumption against the purchase', () => {
    const used = entry('use', 'Consumption of Prepaid Assets', [['5290', 40, 0], ['1285', 0, 40]], {}, { settlesEntryId: 'staples' });
    expect(prepaidAdjustmentItems([purchase, used], accounts, { '1285': 60 }, key)[0].remaining).toBe(60);
  });

  it('lists a balance carried in from an earlier semester as its own row', () => {
    const items = prepaidAdjustmentItems([purchase], accounts, { '1285': 350 }, key);
    expect(items.find(item => item.key === 'carried-1285')).toMatchObject({ remaining: 250, updated: false });
    expect(items.find(item => item.key === 'carried-1285')?.entryId).toBeUndefined();
    expect(prepaidAdjustmentItems([purchase], accounts, { '1285': 350 }, key, { prepaidCarried: { '1285': true } }).find(item => item.key === 'carried-1285')?.updated).toBe(true);
  });

  it('counts a saved draft purchase and a saved draft consumption, so the question shows before posting', () => {
    const draftPurchase = { ...purchase, isDraft: true };
    expect(prepaidAdjustmentItems([draftPurchase], accounts, { '1285': 100 }, key)).toEqual([expect.objectContaining({ entryId: 'staples', remaining: 100 })]);
    const draftUse = { ...entry('use', 'Consumption of Prepaid Assets', [['5290', 40, 0], ['1285', 0, 40]], {}, { settlesEntryId: 'staples' }), isDraft: true };
    const items = prepaidAdjustmentItems([draftPurchase, draftUse], accounts, { '1285': 60 }, key);
    expect(items).toHaveLength(1);
    expect(items[0].remaining).toBe(60);
  });

  it('lists nothing for accounts with no balance', () => {
    expect(prepaidAdjustmentItems([], accounts, {}, key)).toEqual([]);
  });
});

describe('cash in Other Adjustments', () => {
  it('uses Cash plus Cash in Bank and is outstanding until the bank/e-wallet amount is saved', () => {
    expect(cashAdjustment({ '1010': 15000, '1015': 5000 })).toMatchObject({ balance: 20000, required: true, outstanding: true, remainingCash: 20000 });
    expect(cashAdjustment({ '1010': 15000, '1015': 5000 }, { cashBankAndEwallet: 12000 })).toMatchObject({ outstanding: false, declared: 12000, remainingCash: 8000 });
  });

  it('accepts zero, needs nothing when there is no cash, and asks again when the balance falls below the saved amount', () => {
    expect(cashAdjustment({ '1010': 500 }, { cashBankAndEwallet: 0 }).outstanding).toBe(false);
    expect(cashAdjustment({}, undefined)).toMatchObject({ required: false, outstanding: false });
    expect(cashAdjustment({ '1010': 300 }, { cashBankAndEwallet: 500 }).outstanding).toBe(true);
  });

  it('validates the bank/e-wallet amount against the Cash balance', () => {
    const format = (value: number) => `P${value}`;
    expect(checkBankAndEwallet(20000, '', format)).toContain('Enter the amount');
    expect(checkBankAndEwallet(20000, '-1', format)).toBe('The amount cannot be negative.');
    expect(checkBankAndEwallet(20000, '20001', format)).toBe('The amount cannot be greater than the Cash balance of P20000.');
    expect(checkBankAndEwallet(20000, '20000', format)).toBe('');
    expect(checkBankAndEwallet(20000, '0', format)).toBe('');
  });
});

describe('the overall status', () => {
  const base = { entries: [] as JournalEntry[], accounts, openingBalances: {}, accountBalances: {}, semester: '1st Semester' as const, reportingYear: 2026 };

  it('is not outstanding when the semester needs no adjustments, so the tab does not stay red', () => {
    const result = computeOtherAdjustments(base);
    expect(result).toMatchObject({ outstanding: 0, hasOutstanding: false });
    expect(result.ppe.updated && result.prepaid.updated && result.cash.updated).toBe(true);
  });

  it('adds up what is outstanding across the three sections and clears once everything is answered', () => {
    const entries = [buyLaptops('a', 2, 10000, 'g1'), entry('staples', 'Purchase of Prepaid Assets', [['1285', 100, 0], ['1010', 0, 100]], { prepaidAssetItem: 'Staples' })];
    const open = computeOtherAdjustments({ ...base, entries, accountBalances: { '1010': 5000, '1285': 100 } });
    expect(open).toMatchObject({ outstanding: 3, hasOutstanding: true });
    expect(open.ppe.outstanding).toBe(1);
    expect(open.prepaid.outstanding).toBe(1);
    expect(open.cash.outstanding).toBe(true);

    const finalized = entries.map(item => item.id === 'staples' ? { ...item, transactionDetails: { ...item.transactionDetails!, prepaidSemesterFinalized: adjustmentSemesterKey(2026, '1st Semester') } } : item);
    const record = { ppe: { g1: answers(2, 0, 0) }, cashBankAndEwallet: 0 };
    const closed = computeOtherAdjustments({ ...base, entries: [...finalized, depreciate('d', 2000, 'g1')], accountBalances: { '1010': 5000, '1285': 100 }, record });
    expect(closed).toMatchObject({ outstanding: 0, hasOutstanding: false });
  });

  it('has nothing outstanding until a semester is selected', () => {
    expect(computeOtherAdjustments({ ...base, semester: '', reportingYear: undefined, entries: [buyLaptops('a', 2, 10000, 'g1')], accountBalances: { '1010': 5000 } }).hasOutstanding).toBe(false);
  });
});
