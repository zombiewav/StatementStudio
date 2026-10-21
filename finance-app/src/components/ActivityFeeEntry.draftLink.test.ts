import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { ActivityFeeEntry } from './ActivityFeeEntry';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let autoPost = false;
let posted: string[] = [];
const PROJECT = 'General Fund Operations';
function Probe() {
  finance = useFinance();
  const draft = finance.draftTransactions.find(candidate => candidate.label === 'resume') || null;
  return createElement(ActivityFeeEntry, { defaultOpen: true, requestedType: { value: 'receivable', nonce: 1 }, draftToResume: draft, autoPostDraft: autoPost, onDraftPosted: (message: string) => { posted.push(message); } });
}
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');

// A first-semester event leaves ₱1,000 receivable, which is the beginning balance of the second semester.
function start(withBeginningBalance: boolean) {
  autoPost = false; posted = [];
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    if (withBeginningBalance) finance.addJournalEntry('2026-09-01', 'Event fees', PROJECT, [{ accountCode: '1310', debit: 1000, credit: 0 }, { accountCode: '4090', debit: 0, credit: 1000 }]);
  });
  act(() => { finance.switchReportingPeriod('2026-2027', '2nd Semester', 2026); });
}
const byLabel = (label: string) => renderer.root.findAll(node => node.type === 'input' && node.props['aria-label'] === label)[0];
const fill = (date: string, amount: string) => {
  act(() => { byLabel('Date and collection date 1').props.onChange({ target: { value: date } }); });
  act(() => { byLabel('Date and collection amount 1').props.onChange({ target: { value: amount } }); });
};
const save = () => act(() => { renderer.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} }); });
const draftRows = (label: string, amount: string) => ({ category: 'activity-fees', label, formState: { transactionType: 'receivable', receivableCollection: [{ id: label, date: '2027-02-11', amount }] } });

describe('Collection of Activity Fees Receivable is linked to the beginning balance', () => {
  it('has no event dropdown and explains when there is no beginning balance', () => {
    start(false);
    const shown = text(renderer.root);
    expect(shown).toContain('Beginning balance of Activity Fees Receivable still to collect');
    expect(shown).toContain('There is no beginning balance of Activity Fees Receivable to collect.');
    expect(shown).not.toContain('Event with unpaid activity fees');
    expect(renderer.root.findAllByType('select')).toHaveLength(1);
  });

  it('shows the beginning balance and caps the amount, also against other saved drafts', () => {
    start(true);
    expect(text(renderer.root)).toContain('1,000.00');
    fill('2027-02-12', '1200');
    expect(text(renderer.root)).toContain('The amount entered exceeds the beginning balance of');
    save();
    expect(finance.draftTransactions).toHaveLength(0);

    act(() => { finance.saveDraftTransaction(draftRows('other', '700')); });
    expect(text(renderer.root)).toContain('300.00');
    fill('2027-02-12', '400');
    save();
    expect(finance.draftTransactions).toHaveLength(1);
    fill('2027-02-12', '300');
    save();
    expect(finance.draftTransactions).toHaveLength(2);
  });

  it('posting a saved draft records Dr Cash / Cr Activity Fees Receivable and uses up that much of the balance', () => {
    start(true);
    autoPost = true;
    act(() => { finance.saveDraftTransaction(draftRows('resume', '600')); });
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    const entry = finance.journalEntries.find(candidate => candidate.transactionType === 'Collection of Activity Fees Receivable')!;
    expect(entry.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1010', 600, 0], ['1310', 0, 600]]);
    expect(entry.transactionDetails?.activityFeePriorReceivableCollected).toBe(600);
    expect(finance.accountBalances['1310']).toBe(400);
    expect(text(renderer.root)).toContain('400.00');
    fill('2027-02-12', '500');
    expect(text(renderer.root)).toContain('The amount entered exceeds the beginning balance of');
  });
});

describe('Activity Fees "No - next semester" note', () => {
  it('asks to record all advance collections received this semester', () => {
    autoPost = false;
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(() => createElement(ActivityFeeEntry, { defaultOpen: true })))); });
    expect(text(renderer.root)).not.toContain('Please record all advance collections received this semester for the event scheduled next semester.');
    const no = renderer.root.findAllByType('button').find(button => text(button) === 'No - next semester')!;
    act(() => { no.props.onClick(); });
    const full = text(renderer.root);
    expect(full).toContain('Please record all advance collections received this semester for the event scheduled next semester.');
    expect(full.split('Please record all advance collections').length - 1).toBe(1);
    expect(full).not.toContain('Include all current-semester activity-fee collections');
  });

  it('keeps the usual collections note for "Yes - current semester"', () => {
    autoPost = false;
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(() => createElement(ActivityFeeEntry, { defaultOpen: true })))); });
    expect(text(renderer.root)).toContain('Include all current-semester activity-fee collections');
  });
});
