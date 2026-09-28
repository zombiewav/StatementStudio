import { describe, expect, it } from 'vitest';
import { buildActivityFeeFollowUp, buildActivityFeeReceivableCollections, buildInitialActivityFeeSchedule, buildScheduledActivityFeeRecognition } from './activityFees';
import { ActivityFeeRecord } from '../types';

const record = (overrides: Partial<ActivityFeeRecord> = {}): ActivityFeeRecord => ({ id: 'af-1', reference: 'AF-0001', eventName: 'Event', totalExpected: 0, totalCollected: 400, totalRefunded: 0, receivableBalance: 0, deferredBalance: 400, status: 'scheduled', createdAt: '', updatedAt: '', history: [], ...overrides });
const balanced = (lines: { debit: number; credit: number }[]) => expect(lines.reduce((sum, line) => sum + line.debit - line.credit, 0)).toBe(0);

describe('final activity fee workflow', () => {
  it('records collections above the required fee as a refund liability', () => {
    const schedule = buildInitialActivityFeeSchedule({ eventOccursThisPeriod: true, eventDate: '2026-09-15', totalExpected: 15000, priorPeriodCollected: 8000, collections: [{ date: '2026-09-15', amount: 8000 }] });
    expect(schedule.next).toMatchObject({ totalCollected: 16000, refundLiabilityBalance: 1000, status: 'refund-due' });
    expect(schedule.postings.flatMap(item => item.lines)).toContainEqual(expect.objectContaining({ accountCode: '2120', credit: 1000 }));
    schedule.postings.forEach(posting => balanced(posting.lines));
  });

  it('refunds or recognizes an excess activity-fee liability', () => {
    const excess = record({ totalExpected: 15000, totalCollected: 16000, deferredBalance: 0, refundLiabilityBalance: 1000, status: 'refund-due' });
    expect(buildActivityFeeFollowUp(excess, { type: 'refund-excess', amount: 600 })).toMatchObject({ next: { refundLiabilityBalance: 400, status: 'refund-due' }, action: 'excess-refund' });
    expect(buildActivityFeeFollowUp(excess, { type: 'recognize-excess', amount: 1000 })).toMatchObject({ next: { refundLiabilityBalance: 0, status: 'complete' }, action: 'excess-nonrefundable' });
  });
  it('posts each future-event collection separately to unearned activity fees', () => {
    const schedule = buildInitialActivityFeeSchedule({ eventOccursThisPeriod: false, collections: [{ date: '2026-08-01', amount: 100 }, { date: '2026-08-10', amount: 200 }] });
    expect(schedule.postings).toHaveLength(2);
    expect(schedule.next).toMatchObject({ totalExpected: 0, totalCollected: 300, deferredBalance: 300, status: 'scheduled' });
    schedule.postings.forEach(posting => balanced(posting.lines));
  });

  it('separates early, event-date, and post-event collections', () => {
    const schedule = buildInitialActivityFeeSchedule({
      eventOccursThisPeriod: true,
      eventDate: '2026-09-15',
      totalExpected: 1000,
      priorPeriodCollected: 200,
      collections: [
        { date: '2026-09-01', amount: 100 },
        { date: '2026-09-15', amount: 300 },
        { date: '2026-09-20', amount: 150 },
      ],
    });
    expect(schedule.postings.map(posting => posting.date)).toEqual(['2026-09-01', '2026-09-15', '2026-09-20']);
    expect(schedule.next).toMatchObject({ totalCollected: 750, receivableBalance: 250, deferredBalance: 0, status: 'receivable' });
    const recognition = schedule.postings[1].lines;
    expect(recognition).toContainEqual(expect.objectContaining({ accountCode: '2110', debit: 300 }));
    expect(recognition).toContainEqual(expect.objectContaining({ accountCode: '1310', debit: 400 }));
    expect(recognition).toContainEqual(expect.objectContaining({ accountCode: '4090', credit: 1000 }));
    schedule.postings.forEach(posting => balanced(posting.lines));
  });

  it('defaults a blank collection date to the event date for a same-day collection', () => {
    const schedule = buildInitialActivityFeeSchedule({
      eventOccursThisPeriod: true,
      eventDate: '2026-09-15',
      totalExpected: 1000,
      collections: [{ date: '', amount: 300 }],
    });
    expect(schedule.postings).toHaveLength(1);
    expect(schedule.postings[0].date).toBe('2026-09-15');
    const lines = schedule.postings[0].lines;
    expect(lines).toContainEqual(expect.objectContaining({ accountCode: '1010', debit: 300, date: '2026-09-15' }));
    balanced(lines);
  });

  it('still requires a date for a future-event collection, with no event date yet to default to', () => {
    expect(() => buildInitialActivityFeeSchedule({ eventOccursThisPeriod: false, collections: [{ date: '', amount: 100 }] })).toThrow('Each activity-fee collection needs a date.');
  });

  it('recognizes an event with a full receivable when nothing has been collected', () => {
    const schedule = buildInitialActivityFeeSchedule({ eventOccursThisPeriod: true, eventDate: '2026-09-15', totalExpected: 1000, collections: [] });
    expect(schedule.next).toMatchObject({ receivableBalance: 1000, status: 'receivable' });
    balanced(schedule.postings[0].lines);
  });

  it('releases prior unearned collections when a scheduled event is held', () => {
    const schedule = buildScheduledActivityFeeRecognition(record(), 1000, '2027-01-10', [{ date: '2027-01-10', amount: 100 }]);
    expect(schedule.next).toMatchObject({ totalExpected: 1000, totalCollected: 500, receivableBalance: 500, deferredBalance: 0, status: 'receivable' });
    balanced(schedule.postings[0].lines);
  });

  it('also defaults a blank additional-collection date to the event date when a scheduled event is finally held', () => {
    const schedule = buildScheduledActivityFeeRecognition(record(), 1000, '2027-01-10', [{ date: '', amount: 100 }]);
    expect(schedule.next.totalCollected).toBe(500);
    expect(schedule.postings[0].date).toBe('2027-01-10');
  });

  it('records each receivable collection by date and enforces the remaining balance', () => {
    const open = record({ status: 'receivable', totalExpected: 1000, totalCollected: 500, deferredBalance: 0, receivableBalance: 500 });
    const schedule = buildActivityFeeReceivableCollections(open, [{ date: '2026-10-01', amount: 200 }, { date: '2026-10-15', amount: 300 }]);
    expect(schedule.postings).toHaveLength(2);
    expect(schedule.next).toMatchObject({ totalCollected: 1000, receivableBalance: 0, status: 'complete' });
    expect(() => buildActivityFeeReceivableCollections(open, [{ date: '2026-10-01', amount: 501 }])).toThrow(/cannot exceed/i);
  });
});
