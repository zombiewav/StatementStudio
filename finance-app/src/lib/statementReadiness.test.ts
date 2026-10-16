import { describe, expect, it } from 'vitest';
import { pendingDraftLabels } from './statementReadiness';
import { JournalEntry, TransactionDraft } from '../types';

const draft = (id: string, label: string, journalEntryId?: string): TransactionDraft => ({ id, savedAt: '2026-10-01', category: null, label, formState: {}, journalEntryId });
const entry = (id: string, isDraft?: boolean): JournalEntry => ({ id, reference: id, date: '2026-10-01', description: `Entry ${id}`, project: 'p', lines: [], isDraft } as JournalEntry);

describe('pendingDraftLabels', () => {
  it('is empty when nothing is waiting as a draft', () => {
    expect(pendingDraftLabels([], [entry('a')])).toEqual([]);
  });
  it('lists every saved draft', () => {
    expect(pendingDraftLabels([draft('d1', 'Sale of Merchandise', 'a'), draft('d2', 'Purchase of Pins')], [entry('a', true)])).toEqual(['Sale of Merchandise', 'Purchase of Pins']);
  });
  it('also catches a draft journal entry that has no draft record', () => {
    expect(pendingDraftLabels([], [entry('x', true), entry('y')])).toEqual(['Entry x']);
  });
});
