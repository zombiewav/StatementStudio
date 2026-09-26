import { describe, expect, it } from 'vitest';
import { buildActivityFeeFollowUp, buildInitialActivityFeePosting } from './activityFees';
import { ActivityFeeRecord } from '../types';

const record = (overrides: Partial<ActivityFeeRecord> = {}): ActivityFeeRecord => ({ id: 'af-1', reference: 'AF-0001', eventName: 'Event', totalExpected: 1000, totalCollected: 400, totalRefunded: 0, receivableBalance: 0, deferredBalance: 400, status: 'scheduled', createdAt: '', updatedAt: '', history: [], ...overrides });

describe('activity fee workflow', () => {
  it('recognizes a held event and creates a receivable for the unpaid amount', () => {
    const posting = buildInitialActivityFeePosting(1000, 400, true);
    expect(posting.next).toMatchObject({ receivableBalance: 600, status: 'receivable' });
    expect(posting.lines.reduce((s, l) => s + l.debit, 0)).toBe(1000);
    expect(posting.lines.reduce((s, l) => s + l.credit, 0)).toBe(1000);
  });

  it('defers collections when the event is in a future period', () => {
    expect(buildInitialActivityFeePosting(1000, 400, false).next).toMatchObject({ deferredBalance: 400, status: 'scheduled' });
  });

  it('combines prior deferred collections, current cash, and a receivable when the event is held', () => {
    const posting = buildActivityFeeFollowUp(record(), { type: 'event-held', amount: 100 });
    expect(posting.next).toMatchObject({ totalCollected: 500, receivableBalance: 500, deferredBalance: 0, status: 'receivable' });
    expect(posting.lines.reduce((s, l) => s + l.debit, 0)).toBe(1000);
    expect(posting.lines.reduce((s, l) => s + l.credit, 0)).toBe(1000);
  });

  it('carries refunds until the deferred balance reaches zero', () => {
    const first = buildActivityFeeFollowUp(record(), { type: 'cancel-refundable', amount: 150 });
    expect(first.next).toMatchObject({ deferredBalance: 250, status: 'refund-due' });
    const second = buildActivityFeeFollowUp(record({ ...first.next }), { type: 'refund', amount: 250 });
    expect(second.next).toMatchObject({ deferredBalance: 0, totalRefunded: 400, status: 'complete' });
  });

  it('rejects collections and refunds above their remaining balances', () => {
    expect(() => buildActivityFeeFollowUp(record(), { type: 'postpone', amount: 601 })).toThrow(/cannot exceed/i);
    expect(() => buildActivityFeeFollowUp(record(), { type: 'cancel-refundable', amount: 401 })).toThrow(/cannot exceed/i);
    expect(() => buildActivityFeeFollowUp(record({ status: 'complete', deferredBalance: 0 }), { type: 'refund', amount: 0 })).toThrow(/no outstanding/i);
  });
});
