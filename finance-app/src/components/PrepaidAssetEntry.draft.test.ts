import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { PrepaidAssetEntry } from './PrepaidAssetEntry';
import { prepaidAdjustmentItems } from '../lib/otherAdjustments';
import type { TransactionDraft } from '../types';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let resume: { draft: TransactionDraft | null; autoPost: boolean } = { draft: null, autoPost: false };
const noop = () => undefined;
function Probe() {
  finance = useFinance();
  return createElement(PrepaidAssetEntry, { draftToResume: resume.draft, autoPostDraft: resume.autoPost, onDraftResumed: noop });
}
afterEach(() => { if (renderer) act(() => renderer.unmount()); resume = { draft: null, autoPost: false }; });

const change = (node: any, value: string) => act(() => { node.props.onChange({ target: { value } }); });

function fillPurchase() {
  const selects = renderer.root.findAllByType('select');
  change(selects[0], 'Decoration Materials');
  const inputs = renderer.root.findAllByType('input');
  change(inputs.find(input => input.props.type === 'number')!, '300');
  change(renderer.root.findAllByType('select').find(select => select.props.value === 'organization-funds')!, 'not-yet-paid');
}
const saveDraft = () => act(() => { renderer.root.findByType('form').props.onSubmit({ preventDefault: () => undefined }); });

describe('Prepaid Expenses and Other Assets drafts', () => {
  it('writes a real draft entry that shows in Consumption, is replaced (not duplicated) on re-save, and posts once', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => { finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never); });
    fillPurchase();
    saveDraft();

    expect(finance.journalEntries).toHaveLength(1);
    expect(finance.journalEntries[0].isDraft).toBe(true);
    expect(finance.draftTransactions).toHaveLength(1);
    expect(finance.draftTransactions[0].journalEntryId).toBe(finance.journalEntries[0].id);
    const asset = finance.journalEntries[0].lines.find(line => line.debit > 0)!;
    expect(finance.accountBalances[asset.accountCode]).toBe(300);
    // The consumption question exists before the draft is posted.
    const items = prepaidAdjustmentItems(finance.journalEntries, finance.accounts, finance.accountBalances, '2026::1st Semester');
    expect(items.map(item => item.remaining)).toEqual([300]);

    // Saving again replaces the same entry.
    saveDraft();
    expect(finance.journalEntries).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(1);

    // Review's Post: one posted entry remains, the draft record is gone.
    const draftEntryId = finance.journalEntries[0].id;
    resume = { draft: finance.draftTransactions[0], autoPost: true };
    act(() => { renderer.update(createElement(FinanceProvider, null, createElement(Probe))); });
    expect(finance.journalEntries).toHaveLength(1);
    expect(finance.journalEntries[0].id).toBe(draftEntryId);
    expect(finance.journalEntries[0].isDraft).toBeFalsy();
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.accountBalances[asset.accountCode]).toBe(300);
  });
});
