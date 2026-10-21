import { ActivityFeeRecord, TransactionDraft } from '../types';
import { buildInitialActivityFeeSchedule } from './activityFees';

// Client (Oct 2026): an Activity Fees transaction saved only as a draft must still be "linked": collections of the
// receivable beginning balance saved as drafts lower what is left, an event saved as a draft that collected more than its
// fees shows up in the excess list, and advance collections already used in a draft count against the Unearned Activity
// Fees beginning balance. Drafts keep only their form fields (nothing is posted until Review), so these are derived from them.
export const DRAFT_RECORD_PREFIX = 'draft:';
export const isDraftRecordId = (id: string): boolean => id.startsWith(DRAFT_RECORD_PREFIX);

type DraftRow = { date?: unknown; amount?: unknown };
const cents = (value: number) => Math.round(value * 100) / 100;
const rowsOf = (value: unknown): { date: string; amount: number }[] => (Array.isArray(value) ? value as DraftRow[] : [])
  .map(row => ({ date: typeof row.date === 'string' ? row.date : '', amount: Number(row.amount) || 0 }))
  .filter(row => row.amount > 0);
const total = (rows: { amount: number }[]) => cents(rows.reduce((sum, row) => sum + row.amount, 0));
const textOf = (value: unknown) => typeof value === 'string' ? value : '';

export interface ActivityFeeDraftEffects {
  /** What saved drafts of Collection of Activity Fees Receivable already take out of the beginning balance. */
  reservedBeginningReceivableCollected: number;
  /** Events with an excess still to be refunded or recognised, counting drafts. */
  excessRecords: ActivityFeeRecord[];
  /** Advance collections already entered in saved event drafts (they use up the Unearned beginning balance). */
  reservedPriorPeriodCollected: number;
}

export function activityFeeDraftEffects(drafts: TransactionDraft[], records: ActivityFeeRecord[], ignoreDraftId?: string): ActivityFeeDraftEffects {
  const activity = drafts.filter(draft => draft.category === 'activity-fees' && draft.id !== ignoreDraftId);
  const pool = records.map(record => ({ ...record }));
  let reservedPriorPeriodCollected = 0;

  activity.filter(draft => (draft.formState.transactionType ?? 'activity-fees') === 'activity-fees').forEach(draft => {
    const state = draft.formState;
    if (state.eventOccursThisPeriod === 'no' || !textOf(state.eventName).trim()) return;
    const prior = cents(Number(state.priorPeriodCollected) || 0);
    reservedPriorPeriodCollected = cents(reservedPriorPeriodCollected + prior);
    const totalExpected = Number(state.totalExpected) || 0;
    if (totalExpected <= 0) return;
    try {
      const schedule = buildInitialActivityFeeSchedule({
        eventOccursThisPeriod: true,
        eventDate: textOf(state.eventDate),
        totalExpected,
        priorPeriodCollected: prior,
        collections: [...rowsOf(state.priorEventCollections), ...rowsOf(state.onOrAfterEventCollections)],
      });
      pool.push({
        id: `${DRAFT_RECORD_PREFIX}${draft.id}`, reference: 'Draft', eventName: textOf(state.eventName).trim(),
        ...schedule.next, priorPeriodCollected: prior, createdAt: draft.savedAt, updatedAt: draft.savedAt, history: [],
      });
    } catch {
      // Incomplete or invalid fields: the draft is not linked until it is valid.
    }
  });

  const reservedBeginningReceivableCollected = total(activity
    .filter(draft => draft.formState.transactionType === 'receivable')
    .flatMap(draft => rowsOf(draft.formState.receivableCollection)));

  activity.filter(draft => draft.formState.transactionType === 'excess-refund').forEach(draft => {
    const target = pool.find(record => record.id === draft.formState.selectedExcessId);
    if (!target || draft.formState.excessStatus === 'next') return;
    target.refundLiabilityBalance = Math.max(0, cents((target.refundLiabilityBalance || 0) - (Number(draft.formState.excessAmount) || 0)));
  });

  return {
    reservedBeginningReceivableCollected,
    excessRecords: pool.filter(record => (record.refundLiabilityBalance || 0) > 0.005),
    reservedPriorPeriodCollected,
  };
}
