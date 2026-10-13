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

  it('no longer offers the Customer pre-orders / actual sales switch in Merchandise Transactions', () => {
    start(() => undefined, false);
    saveDraft('Acquisition of Merchandise for Sale - Goods Received and On Hand', 'merchandise',
      [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
      { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1' },
      { amount: 1000, date: '2026-10-12', merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandisePaymentMethod: 'organization-funds',
        merchandiseOrganizationPayments: [{ id: 'o1', date: '2026-10-12', amount: '1000' }] });
    const buttons = renderer.root.findAllByType('button').map(button => text(button));
    expect(buttons.some(label => label.includes('Customer pre-orders'))).toBe(false);
    expect(buttons.some(label => label.includes('Purchases / ordinary sales'))).toBe(false);
  });

  it('posts a buyer downpayment as Dr Cash / Cr Unearned Merchandise Revenue, one entry per date', () => {
    start(() => undefined, true);
    saveDraft('Downpayment by Buyer for Pre-Ordered Merchandise', 'merchandise',
      [{ accountCode: '1010', debit: 600, credit: 0 }, { accountCode: '2140', debit: 0, credit: 600 }], { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1' },
      { amount: 850, date: '', merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1',
        buyerInitialDownpayment: [{ id: 'i1', date: '2026-10-05', amount: '500' }],
        buyerSubsequentDownpayments: [{ id: 's1', date: '', amount: '100' }, { id: 's2', date: '2026-10-20', amount: '250' }] });
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.accountBalances['2140']).toBe(850);
    expect(finance.accountBalances['1010']).toBe(50000 + 850);
    const entries = finance.journalEntries.filter(entry => entry.description.startsWith('Downpayment by Buyer'));
    expect(entries.map(entry => entry.date).sort()).toEqual(['2026-10-05', '2026-10-20']);
    expect(entries.map(entry => [entry.transactionDetails?.merchandiseBuyerDownpayment, entry.transactionDetails?.merchandiseItem, entry.transactionDetails?.merchandiseBatch])).toEqual([[true, 'Pins', 'Batch 1'], [true, 'Pins', 'Batch 1']]);
  });

  it('asks for the initial downpayment date before posting a buyer downpayment', () => {
    start(() => undefined, true);
    saveDraft('Downpayment by Buyer for Pre-Ordered Merchandise', 'merchandise',
      [{ accountCode: '1010', debit: 500, credit: 0 }, { accountCode: '2140', debit: 0, credit: 500 }], { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1' },
      { amount: 500, date: '', merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1',
        buyerInitialDownpayment: [{ id: 'i1', date: '', amount: '500' }], buyerSubsequentDownpayments: [] });
    expect(alerts()).toEqual(['Enter the date of the initial downpayment.']);
    expect(posted).toEqual([]);
    expect(finance.draftTransactions).toHaveLength(1);
  });

  describe('sale of merchandise applying buyer downpayments', () => {
    let batchId = '';
    const seedBatchAndDownpayment = () => {
      batchId = finance.addJournalEntry('2026-10-05', 'Acquisition of Merchandise - Pins - Batch 1', PROJECT,
        [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }], undefined, undefined,
        meta('Acquisition of Merchandise for Sale - Goods Received and On Hand', { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandiseQuantity: 10 })).id;
      finance.addJournalEntry('2026-10-06', 'Downpayment by Buyer for Pre-Ordered Merchandise - Pins - Batch 1', PROJECT,
        [{ accountCode: '1010', debit: 300, credit: 0 }, { accountCode: '2140', debit: 0, credit: 300 }], undefined, undefined,
        meta('Downpayment by Buyer for Pre-Ordered Merchandise', { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandiseBuyerDownpayment: true }));
    };
    const saleDraft = (collected: string) => saveDraft('Sale of Merchandise', 'merchandise',
      [{ accountCode: '1200', debit: 1000, credit: 0 }, { accountCode: '4070', debit: 0, credit: 1000 }, { accountCode: '5240', debit: 600, credit: 0 }, { accountCode: '1700', debit: 0, credit: 600 }], {},
      { amount: 1000, date: '2026-10-12', merchandiseSaleItem: 'Pins', merchandiseSaleBatchId: batchId, merchandiseQuantitySold: '5', merchandiseSellingPrice: '200', merchandiseCost: '600',
        merchandiseCollectionMethod: 'organization-direct', merchandiseCollections: [{ id: 'c1', date: '2026-10-12', amount: collected }] });

    it('applies the recorded downpayment: Unearned Merchandise Revenue is cleared and only the rest is collected', () => {
      start(seedBatchAndDownpayment, true);
      saleDraft('700');
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.accountBalances['2140']).toBe(0);
      expect(finance.accountBalances['2150'] || 0).toBe(0);
      expect(finance.accountBalances['1200'] || 0).toBe(0);
      expect(finance.accountBalances['4070']).toBe(1000);
      expect(finance.accountBalances['1010']).toBe(50000 - 1000 + 300 + 700);
      const sale = finance.journalEntries.find(entry => entry.transactionDetails?.merchandiseBuyerDownpaymentEntryIds?.length);
      expect(sale?.transactionDetails?.merchandiseBuyerDownpaymentAmount).toBe(300);
    });

    it('records collections plus downpayments beyond the total sales as Refund Liability - Merchandise', () => {
      start(seedBatchAndDownpayment, true);
      saleDraft('900');
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.accountBalances['2140']).toBe(0);
      expect(finance.accountBalances['2150']).toBe(200);
      expect(finance.accountBalances['1010']).toBe(50000 - 1000 + 300 + 900);
    });
  });

  describe('Excess Merchandise Collection - Status', () => {
    const TITLE = 'Excess Merchandise Collection - Status';
    const seedLiability = () => { finance.addJournalEntry('2026-10-06', 'Excess collection', PROJECT, [{ accountCode: '1010', debit: 500, credit: 0 }, { accountCode: '2150', debit: 0, credit: 500 }]); };
    const draft = (status: string, amount: number, date = '2026-10-12') => saveDraft(TITLE, 'merchandise',
      [{ accountCode: '2150', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }], {},
      { amount, date, membershipRefundStatus: status });

    it('refunds the excess in the current period: Dr Refund Liability - Merchandise / Cr Cash', () => {
      start(seedLiability, true);
      draft('current', 200);
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.accountBalances['2150']).toBe(300);
      expect(finance.accountBalances['1010']).toBe(50000 + 500 - 200);
    });

    it('does not require a date for a merchandise refund in the current period', () => {
      start(seedLiability, true);
      draft('current', 200, '');
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.accountBalances['2150']).toBe(300);
    });

    it('moves a non-refundable excess to Other Income', () => {
      start(seedLiability, true);
      draft('nonrefundable', 150);
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.accountBalances['2150']).toBe(350);
      expect(finance.accountBalances['4050']).toBe(150);
    });

    it('posts nothing when the refund will be made next period and keeps the liability outstanding', () => {
      start(seedLiability, true);
      draft('next', 0, '');
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.draftTransactions).toHaveLength(0);
      expect(finance.accountBalances['2150']).toBe(500);
    });

    it('cannot exceed the available Refund Liability - Merchandise', () => {
      start(seedLiability, true);
      draft('current', 600);
      expect(alerts()).toEqual(['Amount cannot exceed Refund Liability - Merchandise.']);
      expect(posted).toEqual([]);
      expect(finance.draftTransactions).toHaveLength(1);
    });

    it('cannot refund more cash than the organization has', () => {
      start(() => {
        finance.addJournalEntry('2026-10-05', 'Spend down', PROJECT, [{ accountCode: '5030', debit: 49800, credit: 0 }, { accountCode: '1010', debit: 0, credit: 49800 }]);
        finance.addJournalEntry('2026-10-06', 'Excess collection', PROJECT, [{ accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '2150', debit: 0, credit: 100 }]);
        finance.addJournalEntry('2026-10-07', 'Spend down more', PROJECT, [{ accountCode: '5030', debit: 250, credit: 0 }, { accountCode: '1010', debit: 0, credit: 250 }]);
      }, true);
      draft('current', 100);
      expect(alerts()[0]).toMatch(/cannot exceed the available cash balance/);
      expect(posted).toEqual([]);
    });
  });

  describe('Event/Program Expense with several events', () => {
    const draft = (extra: Record<string, unknown>[], first = { amount: 300, eventName: 'October Fest', date: '2026-10-10' }) => saveDraft('Event/Program Expense', 'event-program-expenses',
      [{ accountCode: '5300', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }], {},
      { amount: first.amount, date: first.date, expenseEventName: first.eventName, additionalEvents: extra });
    const eventEntries = () => finance.journalEntries.filter(entry => entry.description.startsWith('Event/Program Expense') && !entry.isDraft);

    it('posts one entry per event, each with its own event name, amount and date', () => {
      start(() => undefined, true);
      draft([{ id: 'e2', amount: '200', eventName: 'Foundation Day', date: '2026-10-15' }, { id: 'e3', amount: '100', eventName: 'Sports Fest', date: '' }]);
      expect(alerts()).toEqual([]);
      expect(posted).toHaveLength(1);
      expect(finance.draftTransactions).toHaveLength(0);
      const entries = eventEntries();
      expect(entries.map(entry => entry.eventName).sort()).toEqual(['Foundation Day', 'October Fest', 'Sports Fest']);
      expect(entries.find(entry => entry.eventName === 'Foundation Day')).toMatchObject({ date: '2026-10-15' });
      expect(entries.find(entry => entry.eventName === 'Sports Fest')?.lines).toEqual([
        { accountCode: '5300', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 },
      ]);
      expect(finance.accountBalances['5300']).toBe(600);
      expect(finance.accountBalances['1010']).toBe(50000 - 600);
    });

    it('shows Amount, Event Name and Date on one line with an Add Event button', () => {
      start(() => undefined, false);
      draft([{ id: 'e2', amount: '200', eventName: 'Foundation Day', date: '' }]);
      const labels = renderer.root.findAllByType('label').map(label => text(label).replace(/\s+/g, ' ').trim());
      expect(labels.filter(label => label.startsWith('Amount'))).toHaveLength(1);
      expect(labels).toContain('Event Name');
      expect(renderer.root.findAllByType('button').some(button => text(button).includes('Add Event'))).toBe(true);
      expect(renderer.root.findAllByType('input').some(input => input.props['aria-label'] === 'Event 2 name' && input.props.value === 'Foundation Day')).toBe(true);
    });

    it('keeps a single entry when there is only one event', () => {
      start(() => undefined, true);
      draft([]);
      expect(alerts()).toEqual([]);
      expect(eventEntries().map(entry => entry.eventName)).toEqual(['October Fest']);
    });

    it('asks for an amount and an event name on every added line', () => {
      start(() => undefined, true);
      draft([{ id: 'e2', amount: '200', eventName: '', date: '' }]);
      expect(alerts()).toEqual(['Enter an amount and an event name on every event line, or remove the line.']);
      expect(posted).toEqual([]);
      expect(finance.draftTransactions).toHaveLength(1);
    });

    it('checks the total of all events against the available cash', () => {
      start(() => {
        finance.addJournalEntry('2026-10-05', 'Spend down', PROJECT, [{ accountCode: '5030', debit: 49500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 49500 }]);
      }, true);
      draft([{ id: 'e2', amount: '300', eventName: 'Foundation Day', date: '' }]);
      expect(alerts()[0]).toMatch(/cannot exceed the available cash balance/);
      expect(posted).toEqual([]);
    });

    it('saves several events as one draft entry holding the total', () => {
      start(() => undefined, false);
      draft([{ id: 'e2', amount: '200', eventName: 'Foundation Day', date: '' }]);
      submit();
      const drafts = finance.journalEntries.filter(entry => entry.isDraft && entry.description.startsWith('Event/Program Expense'));
      expect(drafts).toHaveLength(1);
      expect(drafts[0].lines.find(line => line.accountCode === '5300')?.debit).toBe(500);
      expect(drafts[0].description).toContain('October Fest, Foundation Day');
      expect(finance.draftTransactions).toHaveLength(1);
    });
  });

  it('shows the total-cost reminder, as a noticeable callout, under Total cost of this batch', () => {
    start(() => undefined, false);
    saveDraft('Acquisition of Merchandise for Sale - Goods Received and On Hand', 'merchandise',
      [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }],
      { merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1' },
      { amount: 1000, date: '2026-10-12', merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandisePaymentMethod: 'organization-funds',
        merchandiseOrganizationPayments: [{ id: 'o1', date: '2026-10-12', amount: '1000' }] });
    const callout = renderer.root.findAll(node => node.type === 'p' && typeof node.props.className === 'string' && node.props.className.includes('border-amber-500') && text(node).startsWith('Reminder:'));
    expect(callout).toHaveLength(1);
    expect(text(callout[0])).toBe('Reminder: Enter the total amount spent to purchase and prepare the merchandise for sale. Include not only the purchase price but also other direct costs, such as design fees and labor costs for making the merchandise.');
    const labels = renderer.root.findAll(node => node.type === 'label').map(label => text(label));
    expect(labels).toContain('Total cost of this batch');
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

  it('blocks a reimbursement larger than the available cash even when the officer is owed more', () => {
    start(() => {
      finance.addJournalEntry('2026-10-05', 'Spend down', PROJECT, [{ accountCode: '5030', debit: 49800, credit: 0 }, { accountCode: '1010', debit: 0, credit: 49800 }]);
      officerPurchase();
    });
    saveDraft('Reimbursement to Officer', 'reimbursements-to-officers',
      [{ accountCode: '2050', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }],
      { counterpartyName: 'Alpha' }, { amount: 700, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(alerts().length).toBeGreaterThan(0);
    expect(alerts()[0]).toMatch(/cannot exceed the available cash balance of .*200\.00/);
    expect(posted).toEqual([]);
    expect(finance.draftTransactions).toHaveLength(1);
  });

  it('blocks an officer cash advance larger than the available cash', () => {
    start(() => {
      finance.addJournalEntry('2026-10-05', 'Spend down', PROJECT, [{ accountCode: '5030', debit: 49800, credit: 0 }, { accountCode: '1010', debit: 0, credit: 49800 }]);
    });
    saveDraft('Cash Advances Given to Organization Officers', 'miscellaneous',
      [{ accountCode: '1250', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }],
      { counterpartyName: 'Alpha' }, { amount: 500, date: '2026-10-12', counterpartyName: 'Alpha' });
    expect(alerts()[0]).toContain('cannot exceed the available cash balance');
    expect(posted).toEqual([]);
    expect(finance.draftTransactions).toHaveLength(1);
  });

  it('posts a partly paid expense draft and leaves the unpaid part as an expense payable', () => {
    start(() => undefined, true);
    saveDraft('Purchase of Meals consumed by participants, speakers and organizers', 'expense-transactions',
      [{ accountCode: '5080', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 400 }, { accountCode: '2010', debit: 0, credit: 600 }], {},
      { amount: 1000, date: '2026-10-12', expenseEvent: 'no', notYetUsedAmount: '0', outrightPaymentMethod: 'organization-funds', outrightOrganizationPayments: [{ id: 'o1', date: '', amount: '400' }] });
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    const meals = finance.journalEntries.filter(entry => entry.description.startsWith('Purchase of Meals'));
    expect(meals).toHaveLength(1);
    expect(meals[0].isDraft).toBeFalsy();
    expect(finance.accountBalances['2010']).toBe(600);
    expect(finance.accountBalances['1010']).toBe(50000 - 400);
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
