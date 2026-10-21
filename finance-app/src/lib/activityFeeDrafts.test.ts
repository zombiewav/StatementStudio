import { describe, expect, it } from 'vitest';
import { TransactionDraft } from '../types';
import { activityFeeDraftEffects, isDraftRecordId } from './activityFeeDrafts';

const draft = (id: string, formState: Record<string, unknown>): TransactionDraft => ({ id, savedAt: '2026-10-01T00:00:00Z', category: 'activity-fees', label: id, formState });
const eventDraft = (id: string, extra: Record<string, unknown> = {}) => draft(id, {
  transactionType: 'activity-fees', eventName: 'Foundation Day', eventOccursThisPeriod: 'yes', eventDate: '2026-10-10', totalExpected: '1000', priorPeriodCollected: '0',
  priorEventCollections: [{ id: 'a', date: '', amount: '' }], onOrAfterEventCollections: [{ id: 'b', date: '2026-10-10', amount: '400' }], ...extra,
});
const collectionDraft = (id: string, amount: string) => draft(id, { transactionType: 'receivable', receivableCollection: [{ id: 'x', date: '2026-10-12', amount }] });

describe('Activity Fees drafts are linked', () => {
  it('collections of the receivable beginning balance saved as drafts are set aside', () => {
    expect(activityFeeDraftEffects([collectionDraft('c1', '150'), collectionDraft('c2', '50.5')], []).reservedBeginningReceivableCollected).toBe(200.5);
    expect(activityFeeDraftEffects([], []).reservedBeginningReceivableCollected).toBe(0);
  });

  it('does not count the draft that is being edited against itself', () => {
    expect(activityFeeDraftEffects([collectionDraft('c1', '150'), collectionDraft('c2', '40')], [], 'c1').reservedBeginningReceivableCollected).toBe(40);
    expect(activityFeeDraftEffects([eventDraft('d1', { priorPeriodCollected: '300' })], [], 'd1').reservedPriorPeriodCollected).toBe(0);
  });

  it('ignores event drafts and drafts of other categories when setting aside receivable collections', () => {
    const other = { ...collectionDraft('o', '999'), category: 'merchandise' };
    expect(activityFeeDraftEffects([eventDraft('d1'), other], []).reservedBeginningReceivableCollected).toBe(0);
  });

  it('advance collections in saved event drafts use up the Unearned beginning balance', () => {
    expect(activityFeeDraftEffects([eventDraft('d1', { priorPeriodCollected: '300' }), eventDraft('d2', { priorPeriodCollected: '200' })], []).reservedPriorPeriodCollected).toBe(500);
  });

  it('a draft that collected more than the fees lists an excess to refund, and an excess draft lowers it', () => {
    const over = eventDraft('d1', { totalExpected: '300', onOrAfterEventCollections: [{ id: 'b', date: '2026-10-10', amount: '500' }] });
    const excess = activityFeeDraftEffects([over], []).excessRecords;
    expect(excess[0].refundLiabilityBalance).toBe(200);
    expect(isDraftRecordId(excess[0].id)).toBe(true);
    const refund = draft('e1', { transactionType: 'excess-refund', selectedExcessId: 'draft:d1', excessStatus: 'current', excessAmount: '50' });
    expect(activityFeeDraftEffects([over, refund], []).excessRecords[0].refundLiabilityBalance).toBe(150);
  });

  it('ignores future-event and incomplete drafts, and drafts of other categories', () => {
    const over = { totalExpected: '300', onOrAfterEventCollections: [{ id: 'b', date: '2026-10-10', amount: '500' }] };
    const future = eventDraft('f', { ...over, eventOccursThisPeriod: 'no' });
    const incomplete = eventDraft('i', { ...over, totalExpected: '' });
    const other = { ...eventDraft('o', over), category: 'merchandise' };
    expect(activityFeeDraftEffects([future, incomplete, other], []).excessRecords).toEqual([]);
  });
});
