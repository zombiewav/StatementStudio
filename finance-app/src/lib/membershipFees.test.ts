import { describe, expect, it } from 'vitest';
import { buildCurrentMembershipFeePosting, buildMembershipRefundResolution, buildPriorMembershipCollectionPosting, remainingBeginningMembershipReceivable } from './membershipFees';

describe('membership fee postings', () => {
  it('posts a full same-day collection directly to cash and revenue', () => {
    const result = buildCurrentMembershipFeePosting({ totalFees: 10000, dateOne: '2026-01-01', collections: [{ date: '2026-01-01', amount: 10000 }] });
    expect(result.amountStillReceivable).toBe(0);
    expect(result.lines).toEqual([
      { accountCode: '1010', debit: 10000, credit: 0, date: '2026-01-01' },
      { accountCode: '4040', debit: 0, credit: 10000, date: '2026-01-01' },
    ]);
  });

  it('recognizes the full fee on Date 1 and posts later collections against receivable', () => {
    const result = buildCurrentMembershipFeePosting({ totalFees: 10000, dateOne: '2026-01-01', collections: [{ date: '2026-02-01', amount: 3000 }, { date: '2026-03-01', amount: 6000 }] });
    expect(result.amountStillReceivable).toBe(1000);
    expect(result.lines).toContainEqual({ accountCode: '1300', debit: 10000, credit: 0, date: '2026-01-01' });
    expect(result.lines).toContainEqual({ accountCode: '1010', debit: 3000, credit: 0, date: '2026-02-01' });
    expect(result.lines).toContainEqual({ accountCode: '1300', debit: 0, credit: 6000, date: '2026-03-01' });
  });

  it('supports mixed same-day and later collections', () => {
    const result = buildCurrentMembershipFeePosting({ totalFees: 10000, dateOne: '2026-01-01', collections: [{ date: '2026-01-01', amount: 3000 }, { date: '2026-03-01', amount: 6000 }] });
    expect(result.lines).toContainEqual({ accountCode: '1300', debit: 7000, credit: 0, date: '2026-01-01' });
    expect(result.amountStillReceivable).toBe(1000);
  });

  it('uses Date 1 whenever a collection date is blank', () => {
    const result = buildCurrentMembershipFeePosting({ totalFees: 10000, dateOne: '2026-01-01', collections: [{ date: '', amount: 3000 }, { date: '', amount: 7000 }] });
    expect(result.collections.every(collection => collection.date === '2026-01-01')).toBe(true);
    expect(result.amountStillReceivable).toBe(0);
  });

  it('rejects current-year collections above total collectible fees', () => {
    const result = buildCurrentMembershipFeePosting({ totalFees: 100, dateOne: '2026-01-01', collections: [{ date: '', amount: 101 }] });
    expect(result.refundLiability).toBe(1);
    expect(result.lines).toContainEqual({ accountCode: '2130', debit: 0, credit: 1, date: '2026-01-01' });
  });

  it('posts earlier-period collections separately using each entered collection date', () => {
    const result = buildPriorMembershipCollectionPosting({ availableReceivable: 5000, collections: [{ date: '2026-03-03', amount: 4000 }, { date: '2026-03-04', amount: 500 }] });
    expect(result.lines[0].date).toBe('2026-03-03');
    expect(result.lines[2].date).toBe('2026-03-04');
    expect(result.amountStillReceivable).toBe(500);
  });

  it('rejects earlier-period collections above the available receivable', () => {
    expect(() => buildPriorMembershipCollectionPosting({ availableReceivable: 5000, collections: [{ date: '2026-03-03', amount: 5001 }] })).toThrow(/cannot exceed/i);
  });

  it('requires a date on every earlier-period collection instead of using a separate default date', () => {
    expect(() => buildPriorMembershipCollectionPosting({ availableReceivable: 5000, collections: [{ date: '', amount: 100 }] })).toThrow(/enter a date/i);
  });

  it('applies later collections to receivable first and sends only the excess to refund liability', () => {
    const result = buildCurrentMembershipFeePosting({ totalFees: 1000, dateOne: '2026-08-01', collections: [{ date: '2026-08-01', amount: 400 }, { date: '2026-09-01', amount: 800 }] });
    expect(result.amountStillReceivable).toBe(0);
    expect(result.refundLiability).toBe(200);
    expect(result.lines).toContainEqual({ accountCode: '1300', debit: 0, credit: 600, date: '2026-09-01' });
    expect(result.lines).toContainEqual({ accountCode: '2130', debit: 0, credit: 200, date: '2026-09-01' });
  });

  it('resolves excess membership collections according to the selected refund status', () => {
    expect(buildMembershipRefundResolution({ availableLiability: 500, status: 'current', amount: 300, date: '2026-09-15' })).toEqual([
      { accountCode: '2130', debit: 300, credit: 0, date: '2026-09-15' },
      { accountCode: '1010', debit: 0, credit: 300, date: '2026-09-15' },
    ]);
    expect(buildMembershipRefundResolution({ availableLiability: 500, status: 'next', amount: 0 })).toEqual([]);
    expect(buildMembershipRefundResolution({ availableLiability: 500, status: 'nonrefundable', amount: 500 })).toEqual([
      { accountCode: '2130', debit: 500, credit: 0, date: undefined },
      { accountCode: '4050', debit: 0, credit: 500, date: undefined },
    ]);
  });
});

describe('excess collection resolution for another refund liability', () => {
  it('uses the supplied liability account and name', () => {
    const lines = buildMembershipRefundResolution({ availableLiability: 300, status: 'current', amount: 100, date: '2026-10-12', liabilityCode: '2150', liabilityName: 'Refund Liability - Merchandise' });
    expect(lines.map(line => line.accountCode)).toEqual(['2150', '1010']);
    expect(() => buildMembershipRefundResolution({ availableLiability: 50, status: 'nonrefundable', amount: 100, liabilityCode: '2150', liabilityName: 'Refund Liability - Merchandise' })).toThrow('Amount cannot exceed Refund Liability - Merchandise.');
  });

  it('only asks for the refund date when the caller requires it', () => {
    expect(() => buildMembershipRefundResolution({ availableLiability: 300, status: 'current', amount: 100 })).toThrow('Enter the refund date.');
    expect(buildMembershipRefundResolution({ availableLiability: 300, status: 'current', amount: 100, dateOptional: true })).toHaveLength(2);
  });

  it('keeps the membership defaults', () => {
    expect(buildMembershipRefundResolution({ availableLiability: 300, status: 'nonrefundable', amount: 100 }).map(line => line.accountCode)).toEqual(['2130', '4050']);
    expect(() => buildMembershipRefundResolution({ availableLiability: 50, status: 'nonrefundable', amount: 100 })).toThrow('Amount cannot exceed Refund Liability - Membership Fees.');
  });
});

describe('remainingBeginningMembershipReceivable (Collection of Unpaid Membership Fees from Previous Period)', () => {
  const entry = (id: string, lines: { accountCode: string; debit: number; credit: number }[], extra: Record<string, unknown> = {}) =>
    ({ id, reference: id, date: '2026-01-10', description: id, project: 'General Fund Operations', lines, ...extra }) as never;
  const collection = (id: string, amount: number, extra: Record<string, unknown> = {}) => entry(id, [{ accountCode: '1010', debit: amount, credit: 0 }, { accountCode: '1300', debit: 0, credit: amount }], extra);

  it('starts at the beginning balance, not at the ledger balance', () => {
    expect(remainingBeginningMembershipReceivable(5000, [])).toBe(5000);
    expect(remainingBeginningMembershipReceivable(0, [])).toBe(0);
  });

  it('subtracts what earlier collections already took from the beginning balance', () => {
    expect(remainingBeginningMembershipReceivable(5000, [collection('c1', 1500), collection('c2', 500)])).toBe(3000);
  });

  it('ignores this semester\'s own accrual entries, which also debit the receivable', () => {
    const accrual = entry('accrual', [{ accountCode: '1300', debit: 800, credit: 0 }, { accountCode: '4040', debit: 0, credit: 800 }, { accountCode: '1010', debit: 300, credit: 0 }, { accountCode: '1300', debit: 0, credit: 300 }]);
    expect(remainingBeginningMembershipReceivable(5000, [accrual])).toBe(5000);
  });

  it('gives the amount back when a collection was reversed, and never goes below zero', () => {
    const reversed = collection('c1', 2000, { reversedByEntryId: 'r1' });
    const reversal = entry('r1', [{ accountCode: '1300', debit: 2000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 2000 }], { reversalOfEntryId: 'c1' });
    expect(remainingBeginningMembershipReceivable(5000, [reversed, reversal])).toBe(5000);
    expect(remainingBeginningMembershipReceivable(1000, [collection('c1', 1500)])).toBe(0);
  });

  it('rejects a collection above what is available with the beginning-balance wording', () => {
    expect(() => buildPriorMembershipCollectionPosting({ availableReceivable: 5000, collections: [{ date: '2026-01-05', amount: 6000 }] })).toThrow('beginning balance of Membership Dues Receivable');
  });
});
