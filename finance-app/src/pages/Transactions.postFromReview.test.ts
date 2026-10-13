import { ComponentType, createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { Transactions } from './Transactions';
import { CUSTOMER_ORDER_DRAFT } from '../components/CustomerOrderEntry';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const TransactionsPage = Transactions as unknown as ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let posted: string[] = [];
let saved = 0;
function Host() {
  const draft = finance.draftTransactions[0] || null;
  return createElement(TransactionsPage, {
    draftToResume: draft, autoPostDraft: true, onDraftResumed: () => undefined,
    onDraftSaved: () => { saved += 1; }, onDraftPosted: (message: string) => { posted.push(message); },
  });
}
function Seed() {
  finance = useFinance();
  return finance.draftTransactions.length ? createElement(Host) : null;
}
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const row = (amount: string, date = '') => ({ id: `r-${Math.random()}`, date, amount });

function start() {
  posted = []; saved = 0;
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Seed))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.addJournalEntry('2026-10-01', 'capital', 'General Fund Operations', [{ accountCode: '1010', debit: 50000, credit: 0 }, { accountCode: '4030', debit: 0, credit: 50000 }]);
  });
}
const saveDraft = (category: string, label: string, formState: Record<string, unknown>) =>
  act(() => { finance.saveDraftTransaction({ id: 'd1', category, label, formState }); });

describe('Review "Post" for drafts that only store form state', () => {
  it('posts a Prepaid Expenses draft and removes it', () => {
    start();
    saveDraft('prepaid-assets', 'Purchase of Booth Materials', {
      mode: 'purchase', item: 'Booth Materials', categoryValue: 'supplies', date: '2026-10-12', amount: '300', quantity: '', purpose: 'general', eventName: '',
      paymentMethod: 'organization-funds', officer: '', organizationPayments: [{ date: '', amount: 300 }], officerPayments: [{ date: '', amount: 0 }], advancePayments: [{ date: '', amount: 0 }],
      selectedDownpaymentId: '', selectedPurchaseId: '', semesterFinal: '',
    });
    expect(finance.draftTransactions).toHaveLength(0);
    expect(posted).toHaveLength(1);
    expect(finance.journalEntries.some(entry => entry.description === 'Purchase of Booth Materials' && !entry.isDraft)).toBe(true);
    expect(finance.accountBalances['1010']).toBe(50000 - 300);
  });

  it('keeps an invalid Prepaid draft and shows why', () => {
    start();
    saveDraft('prepaid-assets', 'Purchase of Booth Materials', {
      mode: 'purchase', item: 'Booth Materials', categoryValue: 'supplies', date: '2026-10-12', amount: '300', purpose: 'event', eventName: '',
      paymentMethod: 'organization-funds', officer: '', organizationPayments: [{ date: '', amount: 300 }], officerPayments: [], advancePayments: [],
    });
    expect(finance.draftTransactions).toHaveLength(1);
    expect(posted).toEqual([]);
    const messages = renderer.root.findAll(node => typeof node.props?.className === 'string' && node.props.className.includes('text-rose-600')).map(node => (node.children as unknown[]).join(''));
    expect(messages).toContain('Enter the event name.');
  });

  it('records an Activity Fee draft and removes it', () => {
    start();
    saveDraft('activity-fees', 'Fair', {
      transactionType: 'activity-fees', eventName: 'Fair', totalExpected: '1000', priorPeriodCollected: '', eventOccursThisPeriod: 'yes', eventDate: '2026-11-10',
      collections: [row('')], priorEventCollections: [row('400', '2026-11-09')], onOrAfterEventCollections: [row('600', '2026-11-10')],
    });
    expect(finance.draftTransactions).toHaveLength(0);
    expect(posted).toHaveLength(1);
    expect(finance.activityFeeRecords.map(record => record.eventName)).toEqual(['Fair']);
  });

  it('posts a Customer Order draft and removes it', () => {
    start();
    saveDraft(CUSTOMER_ORDER_DRAFT, 'Customer pre-order: Pins — B1', {
      mode: 'new', orderId: '', item: 'Pins', other: '', batch: 'B1', kind: 'service', total: '1000', estimatedCost: '0', date: '2026-10-12', sales: '', cost: '', quantity: '', batchEntryId: '', refund: '',
      collections: [{ id: 'c1', date: '2026-10-12', amount: '500' }],
    });
    expect(finance.draftTransactions).toHaveLength(0);
    expect(posted).toHaveLength(1);
    expect(finance.journalEntries.some(entry => entry.description.startsWith('Customer pre-order: Pins'))).toBe(true);
  });
});
