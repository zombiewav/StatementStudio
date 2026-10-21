import { describe, expect, it } from 'vitest';
import { JournalEntry } from '../types';
import { remainingBeginningActivityFeeReceivable } from './activityFeeReceivable';

const entry = (id: string, date: string, collected: number | undefined, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date, description: id, project: '', lines: [],
  transactionDetails: { eventRelated: false, receiptAttachmentIds: [], ...(collected === undefined ? {} : { activityFeePriorReceivableCollected: collected }) },
  ...extra,
});

describe('remainingBeginningActivityFeeReceivable', () => {
  it('is the beginning balance less earlier collections of that balance', () => {
    expect(remainingBeginningActivityFeeReceivable(1000, [])).toBe(1000);
    expect(remainingBeginningActivityFeeReceivable(1000, [entry('a', '2026-10-05', 300), entry('b', '2026-10-06', 150.5)])).toBe(549.5);
  });

  it('ignores entries that are not collections of the beginning balance (this semester\'s own event collections)', () => {
    expect(remainingBeginningActivityFeeReceivable(1000, [entry('a', '2026-10-05', undefined), entry('b', '2026-10-06', 0)])).toBe(1000);
  });

  it('gives a reversed collection back and never goes below zero', () => {
    expect(remainingBeginningActivityFeeReceivable(500, [entry('a', '2026-10-05', 200, { reversedByEntryId: 'r' }), entry('r', '2026-10-07', 200, { reversalOfEntryId: 'a' })])).toBe(500);
    expect(remainingBeginningActivityFeeReceivable(100, [entry('a', '2026-10-05', 250)])).toBe(0);
    expect(remainingBeginningActivityFeeReceivable(-20, [])).toBe(0);
  });

  it('counts only collections inside the reporting period', () => {
    const period = { startDate: '2026-08-01', endDate: '2026-12-31' };
    expect(remainingBeginningActivityFeeReceivable(1000, [entry('old', '2026-03-01', 400), entry('now', '2026-10-05', 100)], period)).toBe(900);
  });
});
