import { describe, expect, it } from 'vitest';
import { ActivityFeeRecord, TransactionDraft } from '../types';
import { activityFeeDraftEffects, isDraftRecordId } from './activityFeeDrafts';

const draft = (id: string, formState: Record<string, unknown>): TransactionDraft => ({ id, savedAt: '2026-10-01T00:00:00Z', category: 'activity-fees', label: id, formState });
const eventDraft = (id: string, extra: Record<string, unknown> = {}) => draft(id, {
  transactionType: 'activity-fees', eventName: 'Foundation Day', eventOccursThisPeriod: 'yes', eventDate: '2026-10-10', totalExpected: '1000', priorPeriodCollected: '0',
  priorEventCollections: [{ id: 'a', date: '', amount: '' }], onOrAfterEventCollections: [{ id: 'b', date: '2026-10-10', amount: '400' }], ...extra,
});
const record = (id: string, extra: Partial<ActivityFeeRecord> = {}): ActivityFeeRecord => ({
  id, reference: 'AF-0001', eventName: 'Fun Run', totalExpected: 500, totalCollected: 100, totalRefunded: 0, receivableBalance: 400, deferredBalance: 0, refundLiabilityBalance: 0,
  status: 'receivable', createdAt: '', updatedAt: '', history: [], ...extra,
});

describe('Activity Fees drafts are linked', () => {
  it('shows the receivable of an event that was only saved as a draft', () => {
    const { receivableRecords } = activityFeeDraftEffects([eventDraft('d1')], []);
    expect(receivableRecords).toHaveLength(1);
    expect(isDraftRecordId(receivableRecords[0].id)).toBe(true);
    expect(receivableRecords[0]).toMatchObject({ eventName: 'Foundation Day', receivableBalance: 600 });
  });

  it('does not count the draft that is being edited against itself', () => {
    expect(activityFeeDraftEffects([eventDraft('d1')], [], 'd1').receivableRecords).toEqual([]);
  });

  it('a collection saved as a draft lowers what is left on a posted event, and removes it at zero', () => {
    const collection = (amount: string) => draft('c1', { transactionType: 'receivable', selectedReceivableId: 'r1', receivableCollection: [{ id: 'x', date: '2026-10-12', amount }] });
    expect(activityFeeDraftEffects([collection('150')], [record('r1')]).receivableRecords[0].receivableBalance).toBe(250);
    expect(activityFeeDraftEffects([collection('400')], [record('r1')]).receivableRecords).toEqual([]);
  });

  it('a collection draft on a draft event also lowers it', () => {
    const collection = draft('c1', { transactionType: 'receivable', selectedReceivableId: 'draft:d1', receivableCollection: [{ id: 'x', date: '2026-10-12', amount: '100' }] });
    expect(activityFeeDraftEffects([eventDraft('d1'), collection], []).receivableRecords[0].receivableBalance).toBe(500);
  });

  it('advance collections in saved event drafts use up the Unearned beginning balance', () => {
    expect(activityFeeDraftEffects([eventDraft('d1', { priorPeriodCollected: '300' }), eventDraft('d2', { priorPeriodCollected: '200' })], []).reservedPriorPeriodCollected).toBe(500);
    expect(activityFeeDraftEffects([eventDraft('d1', { priorPeriodCollected: '300' })], [], 'd1').reservedPriorPeriodCollected).toBe(0);
  });

  it('a draft that collected more than the fees lists an excess to refund, and an excess draft lowers it', () => {
    const over = eventDraft('d1', { totalExpected: '300', onOrAfterEventCollections: [{ id: 'b', date: '2026-10-10', amount: '500' }] });
    expect(activityFeeDraftEffects([over], []).excessRecords[0].refundLiabilityBalance).toBe(200);
    const refund = draft('e1', { transactionType: 'excess-refund', selectedExcessId: 'draft:d1', excessStatus: 'current', excessAmount: '50' });
    expect(activityFeeDraftEffects([over, refund], []).excessRecords[0].refundLiabilityBalance).toBe(150);
  });

  it('ignores future-event and incomplete drafts, and drafts of other categories', () => {
    const future = eventDraft('f', { eventOccursThisPeriod: 'no' });
    const incomplete = eventDraft('i', { totalExpected: '' });
    const other = { ...eventDraft('o'), category: 'merchandise' };
    expect(activityFeeDraftEffects([future, incomplete, other], []).receivableRecords).toEqual([]);
  });
});
