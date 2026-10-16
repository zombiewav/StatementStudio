import { JournalEntry, TransactionDraft } from '../types';

/**
 * Names of everything still waiting as a draft: the drafts Review lists, plus any draft journal entry that has
 * lost its draft record. The Financial Statements cannot be generated while this list has anything in it.
 */
export function pendingDraftLabels(drafts: TransactionDraft[], entries: JournalEntry[]): string[] {
  const linked = new Set(drafts.map(draft => draft.journalEntryId).filter(Boolean));
  const orphans = entries.filter(entry => entry.isDraft && !linked.has(entry.id)).map(entry => entry.customName || entry.description);
  return [...drafts.map(draft => draft.label), ...orphans];
}
