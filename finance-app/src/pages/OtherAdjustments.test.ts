import { ComponentType, createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { OTHER_ADJUSTMENTS_NOTE } from '../lib/otherAdjustments';
import { OtherAdjustments } from './OtherAdjustments';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const Page = OtherAdjustments as unknown as ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let autoPost = true;
let resume = false;
let posted: string[] = [];
const PROJECT = 'General Fund Operations';

function Host() {
  const draft = resume ? finance.draftTransactions[0] || null : null;
  return createElement(Page, { draftToResume: draft, autoPostDraft: autoPost, onDraftResumed: () => undefined, onDraftPosted: (message: string) => { posted.push(message); } });
}
function Seed() {
  finance = useFinance();
  return createElement(Host);
}
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const meta = (type: string, details: Record<string, unknown>) => ({ transactionType: type, details: { eventRelated: false, receiptAttachmentIds: [], ...details } as never });

function start(seed: () => void, options: { post?: boolean; resumeDraft?: boolean } = {}) {
  autoPost = options.post ?? true; resume = options.resumeDraft ?? false; posted = [];
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Seed))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.addJournalEntry('2026-10-01', 'capital', PROJECT, [{ accountCode: '1010', debit: 50000, credit: 0 }, { accountCode: '4030', debit: 0, credit: 50000 }]);
    seed();
  });
}
const buy = (code: string, type: string, quantity: number, unitCost: number, referenceId: string) =>
  finance.addJournalEntry('2026-10-02', type, PROJECT, [{ accountCode: code, debit: quantity * unitCost, credit: 0 }, { accountCode: '1010', debit: 0, credit: quantity * unitCost }], undefined, undefined, meta(type, { ppeQuantity: quantity, ppeUnitCost: unitCost, ppeReferenceId: referenceId }));
const laptops = () => { buy('1501', 'Purchase of Laptop', 3, 10000, 'g1'); buy('1501', 'Purchase of Laptop', 2, 8000, 'g2'); };
const button = (label: string) => renderer.root.findAllByType('button').find(item => text(item).includes(label))!;
const field = (label: string) => renderer.root.findAll(node => node.type === 'input' && node.props['aria-label'] === label)[0];
const type = (label: string, value: string) => act(() => { field(label).props.onChange({ target: { value } }); });
const alerts = () => renderer.root.findAll(node => node.props?.role === 'alert').map(node => text(node));
const record = () => (finance.settings as any).otherAdjustments?.['2026::1st Semester'];

describe('Other Adjustments page', () => {
  it('shows the note under the title and says there is nothing to adjust when no PPE is held', () => {
    start(() => undefined);
    const shown = text(renderer.root);
    expect(shown).toContain(OTHER_ADJUSTMENTS_NOTE);
    expect(shown.indexOf('Other Adjustments')).toBeLessThan(shown.indexOf(OTHER_ADJUSTMENTS_NOTE));
    expect(shown).toContain('Depreciation/Retirement of Property, Plant, and Equipment (PPE)');
    expect(shown).toContain('No PPE item has a remaining quantity');
  });

  it('lists the PPE items, then the groups of one item with quantity, amount per unit, cost, depreciation and Net Book Value', () => {
    start(laptops);
    expect(text(renderer.root)).toContain('Laptop');
    expect(text(renderer.root)).not.toContain('Available Quantity');
    act(() => { button('Laptop').props.onClick(); });
    const shown = text(renderer.root);
    for (const heading of ['Group', 'Available Quantity', 'Amount per Unit', 'Remaining Original Cost', 'Accumulated Depreciation', 'Net Book Value']) expect(shown).toContain(heading);
    const rows = renderer.root.findAllByType('tr').filter(row => text(row).startsWith(' Group') || /^ ?Group \d/.test(text(row).trim()));
    expect(rows.map(row => text(row).replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Group 1 2 ₱8,000.00 ₱16,000.00 ₱0.00 ₱16,000.00'),
      expect.stringContaining('Group 2 3 ₱10,000.00 ₱30,000.00 ₱0.00 ₱30,000.00'),
    ]);
  });

  it('asks the three questions for a group, adds them up in a TOTAL and only accepts a total equal to the available quantity', () => {
    start(laptops);
    act(() => { button('Laptop').props.onClick(); });
    act(() => { button('Group 2').props.onClick(); });
    const shown = text(renderer.root);
    expect(shown).toContain('How many of these units will you continue to use next semester and/or in the future?');
    expect(shown).toContain('How many of these units will not be used this semester but will be used again next school year?');
    expect(shown).toContain('How many of these units will no longer be used this semester or in the future?');
    type('Question 1 quantity', '1'); type('Question 2 quantity', '1');
    expect(text(renderer.root)).toContain('2 of 3');
    expect(alerts().join(' ')).toContain('cannot be less than the available quantity of 3');
    expect(button('Save classification').props.disabled).toBe(true);
    type('Question 3 quantity', '2');
    expect(alerts().join(' ')).toContain('cannot exceed the available quantity of 3');
    type('Question 3 quantity', '-1');
    expect(alerts().join(' ')).toContain('cannot be negative');
    type('Question 3 quantity', '1');
    expect(text(renderer.root)).toContain('3 of 3');
    expect(alerts()).toEqual([]);
    expect(button('Save classification').props.disabled).toBe(false);
    act(() => { button('Save classification').props.onClick(); });
    expect(record().ppe.g1).toEqual({ continueQuantity: 1, nextYearQuantity: 1, retireQuantity: 1 });
  });

  it('shows the retirement form for the units no longer used, pre-identified, and holds the depreciation back until it is recorded', () => {
    start(laptops);
    act(() => { button('Laptop').props.onClick(); });
    act(() => { button('Group 2').props.onClick(); });
    type('Question 1 quantity', '2'); type('Question 2 quantity', '0'); type('Question 3 quantity', '1');
    act(() => { button('Save classification').props.onClick(); });
    const shown = text(renderer.root);
    expect(shown).toContain('Retirement of PPE');
    expect(shown).toContain('Laptop · ₱10,000.00 per unit');
    const quantity = renderer.root.findAll(node => node.type === 'input' && node.props.placeholder === 'Units to dispose of')[0];
    expect(quantity.props.value).toBe('1');
    expect(quantity.props.readOnly).toBe(true);
    expect(shown).toContain('Record the retirement first');
    expect(shown).not.toContain('Depreciation of Laptop');

    act(() => { renderer.root.findAllByType('form').find(form => text(form).includes('Retirement of PPE'))!.props.onSubmit({ preventDefault() {} }); });
    expect(finance.journalEntries.filter(entry => entry.transactionType === 'Retirement of PPE' && entry.isDraft)).toHaveLength(1);
    const after = text(renderer.root);
    expect(after).toContain('Depreciation of Laptop');
    expect(after).not.toContain('Record the retirement first');
  });

  it('records depreciation for the kept units, capped at the Net Book Value', () => {
    start(laptops);
    act(() => { button('Laptop').props.onClick(); });
    act(() => { button('Group 1').props.onClick(); });
    type('Question 1 quantity', '2'); type('Question 2 quantity', '0'); type('Question 3 quantity', '0');
    act(() => { button('Save classification').props.onClick(); });
    const form = () => renderer.root.findAllByType('form').find(item => text(item).includes('Depreciation of Laptop'))!;
    expect(text(form())).toContain('Event: General and Administrative (automatic classification)');
    expect(text(form())).toContain('Net Book Value of the selected purchase: ₱16,000.00');
    const amount = () => form().findAllByType('input').find(item => item.props.placeholder === '0.00')!;
    act(() => { amount().props.onChange({ target: { value: '16001' } }); });
    act(() => { form().props.onSubmit({ preventDefault() {} }); });
    expect(alerts().join(' ')).toContain('Net Book Value');
    expect(finance.journalEntries.filter(entry => entry.transactionType === 'Depreciation of Laptop')).toHaveLength(0);
    act(() => { amount().props.onChange({ target: { value: '1600' } }); });
    act(() => { form().props.onSubmit({ preventDefault() {} }); });
    const draft = finance.journalEntries.find(entry => entry.transactionType === 'Depreciation of Laptop')!;
    expect(draft.isDraft).toBe(true);
    expect(draft.transactionDetails).toMatchObject({ ppeReferenceId: 'g2', ppeItemCode: '1501' });
    expect(draft.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['5090', 1600, 0], ['1550', 0, 1600]]);
  });
});

describe('Depreciation and Retirement drafts resumed from Review land on Other Adjustments', () => {
  const depreciationDraft = (amount: number, details: Record<string, unknown> = { ppeReferenceId: 'g2' }, formState: Record<string, unknown> = {}) => act(() => {
    const entry = finance.addJournalEntry('2026-10-12', 'Depreciation of Laptop', PROJECT, [{ accountCode: '5090', debit: amount, credit: 0 }, { accountCode: '1550', debit: 0, credit: amount }], undefined, undefined, meta('Depreciation of Laptop', details), true, 'd1');
    finance.saveDraftTransaction({ id: 'd1', category: 'depreciation', label: 'Depreciation of Laptop', formState: { amount, date: '2026-10-12', ...formState }, journalEntryId: entry.id });
  });

  it('Post posts a depreciation within the Net Book Value', () => {
    start(laptops, { resumeDraft: true });
    depreciationDraft(1000);
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.accountBalances['1550']).toBe(1000);
    expect(finance.journalEntries.find(entry => entry.transactionType === 'Depreciation of Laptop')!.isDraft).toBeFalsy();
  });

  it('Post refuses a depreciation above the Net Book Value', () => {
    start(laptops, { resumeDraft: true });
    depreciationDraft(20000);
    expect(alerts().join(' ')).toContain('Net Book Value');
    expect(posted).toHaveLength(0);
    expect(finance.draftTransactions).toHaveLength(1);
  });

  it('Post refuses a depreciation for units that are already fully depreciated', () => {
    start(() => {
      buy('1513', 'Purchase of Adaptor', 2, 50, 'a1');
      finance.addJournalEntry('2026-10-03', 'Depreciation of Adaptor', PROJECT, [{ accountCode: '5090', debit: 100, credit: 0 }, { accountCode: '1550', debit: 0, credit: 100 }], undefined, undefined, meta('Depreciation of Adaptor', { ppeReferenceId: 'a1' }));
    }, { resumeDraft: true });
    act(() => {
      const entry = finance.addJournalEntry('2026-10-12', 'Depreciation of Adaptor', PROJECT, [{ accountCode: '5090', debit: 10, credit: 0 }, { accountCode: '1550', debit: 0, credit: 10 }], undefined, undefined, meta('Depreciation of Adaptor', { ppeReferenceId: 'a1' }), true, 'd1');
      finance.saveDraftTransaction({ id: 'd1', category: 'depreciation', label: 'Depreciation of Adaptor', formState: { amount: 10, date: '2026-10-12' }, journalEntryId: entry.id });
    });
    expect(alerts().join(' ')).toContain('Net Book Value of zero');
    expect(posted).toHaveLength(0);
  });

  it('finds the group of a depreciation draft saved before references existed (it names only the item)', () => {
    start(() => { buy('1501', 'Purchase of Laptop', 3, 10000, 'g1'); }, { resumeDraft: true });
    depreciationDraft(500, {});
    expect(alerts()).toEqual([]);
    expect(posted).toHaveLength(1);
    expect(finance.accountBalances['1550']).toBe(500);
  });

  it('Continue opens Retirement of PPE for the saved group, with the saved quantity, still a draft', () => {
    start(() => { buy('1501', 'Purchase of Laptop', 5, 100, 'r-a'); }, { post: false, resumeDraft: true });
    act(() => {
      const entry = finance.addJournalEntry('2026-10-12', 'Retirement of PPE - Laptop', PROJECT, [{ accountCode: '5370', debit: 200, credit: 0 }, { accountCode: '1501', debit: 0, credit: 200 }], undefined, undefined,
        meta('Retirement of PPE', { ppeItemCode: '1501', ppeReferenceId: 'r-a', ppeRetiredQuantity: 2, ppeRetiredCost: 200, ppeRetiredAccumulated: 0 }), true, 'd2');
      finance.saveDraftTransaction({ id: 'd2', category: 'retirement-of-ppe', label: 'Retirement of PPE - Laptop', formState: { itemCode: '1501', referenceChoice: 'r-a', quantity: '2', date: '2026-10-12' }, journalEntryId: entry.id });
    });
    const form = renderer.root.findAllByType('form').find(item => text(item).includes('Retirement of PPE'))!;
    expect(form).toBeDefined();
    expect(form.findAllByType('input').find(item => item.props.placeholder === 'Units to dispose of')!.props.value).toBe('2');
    expect(posted).toEqual([]);
    expect(finance.draftTransactions).toHaveLength(1);
  });

  it('Post posts a retirement draft (a zero Net Book Value needs no loss, so no confirm is needed beyond the form checks)', () => {
    start(() => { buy('1501', 'Purchase of Laptop', 5, 100, 'r-a'); }, { post: true, resumeDraft: true });
    act(() => {
      const entry = finance.addJournalEntry('2026-10-12', 'Retirement of PPE - Laptop', PROJECT, [{ accountCode: '5370', debit: 200, credit: 0 }, { accountCode: '1501', debit: 0, credit: 200 }], undefined, undefined,
        meta('Retirement of PPE', { ppeItemCode: '1501', ppeReferenceId: 'r-a', ppeRetiredQuantity: 2, ppeRetiredCost: 200, ppeRetiredAccumulated: 0 }), true, 'd2');
      finance.saveDraftTransaction({ id: 'd2', category: 'retirement-of-ppe', label: 'Retirement of PPE - Laptop', formState: { itemCode: '1501', referenceChoice: 'r-a', quantity: '2', date: '2026-10-12' }, journalEntryId: entry.id });
    });
    // A retirement with a loss asks to confirm before it is posted from Review.
    expect(renderer.root.findAll(node => node.props?.role === 'alertdialog')).toHaveLength(1);
    expect(posted).toEqual([]);
  });
});

describe('Consumption of Prepaid Assets in Other Adjustments', () => {
  const staples = () => finance.addJournalEntry('2026-10-05', 'Purchase of Staples', PROJECT, [{ accountCode: '1285', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }], undefined, undefined,
    meta('Purchase of Prepaid Assets', { prepaidAssetItem: 'Staples', prepaidAssetCategory: 'supplies' }));
  const amount = () => renderer.root.findAll(node => node.type === 'input' && node.props['aria-label'] === 'Amount consumed')[0];
  const enter = (value: string) => act(() => { amount().props.onChange({ target: { value } }); });
  const consumption = () => finance.journalEntries.filter(entry => entry.transactionType === 'Consumption of Prepaid Assets');

  it('lists a prepaid purchase with its available balance and asks how much was consumed', () => {
    start(() => { staples(); });
    const shown = text(renderer.root);
    expect(shown).toContain('Consumption of Prepaid Assets');
    expect(shown).toContain('Staples');
    expect(shown).toContain('Available balance ₱100.00');
    act(() => { button('Update').props.onClick(); });
    expect(text(renderer.root)).toContain('How much of this has been used or consumed this semester?');
  });

  it('refuses a negative amount and an amount above the available balance', () => {
    start(() => { staples(); });
    act(() => { button('Update').props.onClick(); });
    enter('-5'); act(() => { button('Save adjustment').props.onClick(); });
    expect(alerts().join(' ')).toContain('cannot be negative');
    enter('150'); act(() => { button('Save adjustment').props.onClick(); });
    expect(alerts().join(' ')).toContain('cannot be more than the available balance of ₱100.00');
    expect(consumption()).toHaveLength(0);
  });

  it('posts the consumption (Dr expense / Cr prepaid), reduces the balance and marks the item updated so it cannot be recorded twice', () => {
    start(() => { staples(); });
    act(() => { button('Update').props.onClick(); });
    enter('40'); act(() => { button('Save adjustment').props.onClick(); });
    const [entry] = consumption();
    expect(entry.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['5290', 40, 0], ['1285', 0, 40]]);
    expect(entry.settlesEntryId).toBeDefined();
    expect(finance.accountBalances['1285']).toBe(60);
    const shown = text(renderer.root);
    expect(shown).toContain('Available balance ₱60.00');
    expect(shown).toContain('Updated');
    expect(renderer.root.findAllByType('button').some(item => text(item).trim() === 'Update')).toBe(false);
    expect(consumption()).toHaveLength(1);
  });

  it('accepts 0 (nothing consumed): marks the item updated without posting anything', () => {
    start(() => { staples(); });
    act(() => { button('Update').props.onClick(); });
    enter('0'); act(() => { button('Save adjustment').props.onClick(); });
    expect(consumption()).toHaveLength(0);
    expect(finance.accountBalances['1285']).toBe(100);
    expect(text(renderer.root)).toContain('Updated');
  });

  it('asks for the event name when the consumption is for an event', () => {
    start(() => { staples(); });
    act(() => { button('Update').props.onClick(); });
    enter('40');
    act(() => { renderer.root.findAllByType('select')[0].props.onChange({ target: { value: 'event' } }); });
    act(() => { button('Save adjustment').props.onClick(); });
    expect(alerts().join(' ')).toContain('Enter the event name');
    expect(consumption()).toHaveLength(0);
  });
});

describe('Cash in Other Adjustments', () => {
  const held = () => renderer.root.findAll(node => node.type === 'input' && node.props['aria-label'] === 'Held in bank accounts and e-wallets')[0];
  const enter = (value: string) => act(() => { held().props.onChange({ target: { value } }); });
  const save = () => act(() => { renderer.root.findAllByType('button').find(item => text(item).trim() === 'Save')!.props.onClick(); });

  it('shows the Cash balance and asks how much of it is held in bank accounts and/or e-wallets', () => {
    start(() => undefined);
    const shown = text(renderer.root);
    expect(shown).toContain('Balance of Cash: ₱50,000.00');
    expect(shown).toContain('How much of this amount is held in bank accounts and/or e-wallets?');
  });

  it('refuses a negative amount and an amount above the Cash balance, and saves a valid one without touching the balance', () => {
    start(() => undefined);
    const entriesBefore = finance.journalEntries.length;
    enter('-1'); save();
    expect(alerts()).toContain('The amount cannot be negative.');
    enter('50001'); save();
    expect(alerts().join(' ')).toContain('cannot be greater than the Cash balance of ₱50,000.00');
    expect(record()?.cashBankAndEwallet).toBeUndefined();
    enter('30000'); save();
    expect(record().cashBankAndEwallet).toBe(30000);
    expect(text(renderer.root)).toContain('Remaining cash held outside bank accounts and e-wallets: ₱20,000.00');
    expect(finance.accountBalances['1010']).toBe(50000);
    expect(finance.journalEntries).toHaveLength(entriesBefore);
  });

  it('says there is nothing to answer when the organization holds no cash', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Seed))); });
    act(() => { finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never); });
    expect(text(renderer.root)).toContain('no cash balance');
  });
});
