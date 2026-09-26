import { describe, expect, it } from 'vitest';
import { buildCurrentMembershipFeePosting, buildPriorMembershipCollectionPosting } from './membershipFees';

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
    expect(() => buildCurrentMembershipFeePosting({ totalFees: 100, dateOne: '2026-01-01', collections: [{ date: '', amount: 101 }] })).toThrow(/cannot exceed/i);
  });

  it('posts earlier-period collections separately and falls back to Date 1', () => {
    const result = buildPriorMembershipCollectionPosting({ availableReceivable: 5000, dateOne: '2026-03-03', collections: [{ date: '', amount: 4000 }, { date: '2026-03-04', amount: 500 }] });
    expect(result.lines[0].date).toBe('2026-03-03');
    expect(result.lines[2].date).toBe('2026-03-04');
    expect(result.amountStillReceivable).toBe(500);
  });

  it('rejects earlier-period collections above the available receivable', () => {
    expect(() => buildPriorMembershipCollectionPosting({ availableReceivable: 5000, dateOne: '2026-03-03', collections: [{ date: '', amount: 5001 }] })).toThrow(/cannot exceed/i);
  });
});
