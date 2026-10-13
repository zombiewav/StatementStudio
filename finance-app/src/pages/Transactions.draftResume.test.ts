import { ComponentType, createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { Transactions } from './Transactions';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const TransactionsPage = Transactions as unknown as ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let autoPost = true;
let posted: string[] = [];
let saved = 0;
function Host() {
  const draft = finance.draftTransactions[0] || null;
  return createElement(TransactionsPage, {
    draftToResume: draft, autoPostDraft: autoPost, onDraftResumed: () => undefined,
    onDraftSaved: () => { saved += 1; }, onDraftPosted: (message: string) => { posted.push(message); },
  });
}
function Seed() {
  finance = useFinance();
  return finance.draftTransactions.length ? createElement(Host) : null;
}
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join('');
const meta = (type: string, details: Record<string, unknown>) => ({ transactionType: type, details: { eventRelated: false, receiptAttachmentIds: [], ...details } as never });
const PROJECT = 'General Fund Operations';

function start(seed: () => void, post = true) {
  autoPost = post; posted = []; saved = 0;
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Seed))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.addJournalEntry('2026-10-01', 'capital', PROJECT, [{ accountCode: '1010', debit: 50000, credit: 0 }, { accountCode: '4030', debit: 0, credit: 50000 }]);
    seed();
  });
}
function saveDraft(txName: string, category: string, lines: { accountCode: string; debit: number; credit: number }[], details: Record<string, unknown>, formState: Record<string, unknown>) {
  act(() => {
    const entry = finance.addJournalEntry('2026-10-12', txName, PROJECT, lines, undefined, undefined, meta(txName, details), true, 'd1');
    finance.saveDraftTransaction({ id: 'd1', category, label: txName, formState: { txName, selectedCategory: category, ...formState }, journalEntryId: entry.id });
  });
}
const submit = () => act(() => { renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
const buttonLabels = () => renderer.root.findAllByType('button').filter(button => button.props.type === 'submit').map(button => text(button));
const alerts = () => renderer.root.findAll(node => node.props?.role === 'alert').map(node => text(node));

describe('resuming a saved draft', () => {
  const officerPurchase = () => finance.addJournalEntry('2026-10-11', 'Purchase of Laptop', PROJECT, [{ accountCode: '1501', debit: 700, credit: 0 }, { accountCode: '2050', debit: 0, credit: 700 }], undefined, undefined, meta('Purchase of Laptop', { counterpartyName: 'Alpha' }));

  it('posts a reimbursement equal to what is owed, even though its own draft already reduced the balance', () => {
    start(() => { officerPurchase(); });
    saveDraft('Reimbursement to Officer', 'reimbursements-to-officers',
      [{ accountCode: '2050', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }],
      { counterpartyName: 'Alpha' }, { amount: 700, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.journalEntries.filter(entry => entry.isDraft)).toHaveLength(0);
    expect(finance.accountBalances['2050']).toBe(0);
    expect(finance.accountBalances['1010']).toBe(50000 - 700);
  });

  it('still blocks a reimbursement above the total Due to Officers balance', () => {
    start(() => { officerPurchase(); });
    saveDraft('Reimbursement to Officer', 'reimbursements-to-officers',
      [{ accountCode: '2050', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }],
      { counterpartyName: 'Alpha' }, { amount: 900, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(alerts().length).toBeGreaterThan(0);
    expect(new Set(alerts())).toEqual(new Set(['Reimbursement cannot exceed the total Due to Officers balance.']));
    expect(posted).toEqual([]);
    expect(finance.draftTransactions).toHaveLength(1);
  });

  it('limits a reimbursement by the total balance when the balance has no officer name', () => {
    start(() => {
      finance.addJournalEntry('2026-10-11', 'Purchase of Laptop', PROJECT, [{ accountCode: '1501', debit: 700, credit: 0 }, { accountCode: '2050', debit: 0, credit: 700 }]);
    });
    saveDraft('Reimbursement to Officer', 'reimbursements-to-officers',
      [{ accountCode: '2050', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }],
      { counterpartyName: 'Alpha' }, { amount: 700, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(alerts()).toEqual([]);
    expect(finance.draftTransactions).toHaveLength(0);
  });

  it('keeps the linked downpayment when a saved acquisition draft is posted', () => {
    let downpaymentId = '';
    start(() => {
      downpaymentId = finance.addJournalEntry('2026-10-12', 'Downpayment', PROJECT, [{ accountCode: '1270', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }], undefined, undefined,
        meta('Supplier Downpayment', { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1' })).id;
    });
    saveDraft('Acquisition of Merchandise for Sale - Goods Received and On Hand', 'merchandise',
      [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1270', debit: 0, credit: 500 }, { accountCode: '1010', debit: 0, credit: 500 }],
      { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandisePrepaymentEntryId: downpaymentId, merchandisePrepaymentEntryIds: [downpaymentId], merchandisePrepaymentAmount: 500 },
      { amount: 1000, date: '2026-10-12', merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandisePrepaymentEntryId: downpaymentId, merchandisePaymentMethod: 'organization-funds',
        merchandiseOrganizationPayments: [{ id: 'o1', date: '2026-10-12', amount: '500' }] });
    expect(alerts()).toEqual([]);
    const acquisition = finance.journalEntries.find(entry => entry.description.includes('Pins - Batch 1') && !entry.isDraft);
    expect(acquisition?.lines.find(line => line.accountCode === '1270')).toMatchObject({ credit: 500 });
    expect(acquisition?.transactionDetails?.merchandisePrepaymentEntryIds).toEqual([downpaymentId]);
    expect(finance.accountBalances['1270']).toBe(0);
    expect(finance.accountBalances['1010']).toBe(50000 - 500 - 500);
  });

  it('keeps the form on Save as Draft and updates the same entry instead of posting', () => {
    start(() => { officerPurchase(); }, false);
    saveDraft('Reimbursement to Officer', 'reimbursements-to-officers',
      [{ accountCode: '2050', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }],
      { counterpartyName: 'Alpha' }, { amount: 300, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(buttonLabels()).toEqual(['Save as Draft']);
    const draftEntryId = finance.draftTransactions[0].journalEntryId;
    submit();
    submit();
    expect(saved).toBe(2);
    expect(posted).toEqual([]);
    const sameEntries = finance.journalEntries.filter(entry => entry.description === 'Reimbursement to Officer');
    expect(sameEntries).toHaveLength(1);
    expect(sameEntries[0].id).toBe(draftEntryId);
    expect(sameEntries[0].isDraft).toBe(true);
    expect(finance.draftTransactions).toHaveLength(1);
    expect(finance.accountBalances['1010']).toBe(50000 - 300);
    expect(finance.accountBalances['2050']).toBe(700 - 300);
  });

  it('posts a draft whose cash effect already used up the last of the cash (no second deduction)', () => {
    start(() => {
      finance.addJournalEntry('2026-10-05', 'Spend down', PROJECT, [{ accountCode: '5030', debit: 49500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 49500 }]);
      finance.addJournalEntry('2026-10-11', 'Purchase of Laptop', PROJECT, [{ accountCode: '1501', debit: 500, credit: 0 }, { accountCode: '2050', debit: 0, credit: 500 }], undefined, undefined, meta('Purchase of Laptop', { counterpartyName: 'Alpha' }));
    });
    expect(finance.accountBalances['1010']).toBe(500);
    saveDraft('Reimbursement to Officer', 'reimbursements-to-officers',
      [{ accountCode: '2050', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }],
      { counterpartyName: 'Alpha' }, { amount: 500, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.accountBalances['1010']).toBe(0);
    expect(finance.accountBalances['2050']).toBe(0);
    expect(finance.journalEntries.filter(entry => entry.description === 'Reimbursement to Officer')).toHaveLength(1);
  });

  it('posts an organization-paid purchase whose draft already used all the available cash', () => {
    start(() => {
      finance.addJournalEntry('2026-10-05', 'Spend down', PROJECT, [{ accountCode: '5030', debit: 49500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 49500 }]);
    });
    saveDraft('Purchase of Laptop', 'ppe-transactions',
      [{ accountCode: '1501', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }], {},
      { amount: 500, date: '2026-10-12', outrightPaymentMethod: 'organization-funds', outrightOrganizationPayments: [{ id: 'o1', date: '', amount: '500' }] });
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.accountBalances['1010']).toBe(0);
    expect(finance.accountBalances['1501']).toBe(500);
    expect(finance.journalEntries.filter(entry => entry.description === 'Purchase of Laptop')).toHaveLength(1);
  });
});
