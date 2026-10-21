import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { RetirementOfPpeEntry } from './RetirementOfPpeEntry';
import { ReturnOfAdvancesEntry } from './ReturnOfAdvancesEntry';
import { buildPpeReferences, planPpeRetirement } from '../lib/ppeItems';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const PROJECT = 'General Fund Operations';
const meta = (type: string, details: Record<string, unknown> = {}) => ({ transactionType: type, details: { eventRelated: false, receiptAttachmentIds: [], ...details } as never });
const balance = (quantity: number, cost: number, accumulatedDepreciation: number) => ({
  referenceId: 'r1', unitCost: Math.round(cost / quantity * 100) / 100,
  item: { code: '1513', label: 'Adaptor', purchaseType: 'Purchase of Adaptor', depreciationType: 'Depreciation of Adaptor', accumulatedAccountCode: '1550' as const, depreciationExpenseCode: '5090' as const },
  quantity, cost, accumulatedDepreciation, netBookValue: cost - accumulatedDepreciation,
});

describe('planPpeRetirement', () => {
  it('writes off the remaining book value as a loss (Case 1: the client example)', () => {
    const plan = planPpeRetirement(balance(5, 500, 100), 1, '2026-10-12');
    expect(plan).toMatchObject({ quantity: 1, cost: 100, accumulatedDepreciation: 20, netBookValue: 80, kind: 'positive' });
    expect(plan.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1550', 20, 0], ['5370', 80, 0], ['1513', 0, 100]]);
  });

  it('needs no loss when the item is fully depreciated (Case 2)', () => {
    const plan = planPpeRetirement(balance(2, 200, 200), 1, '2026-10-12');
    expect(plan.kind).toBe('zero');
    expect(plan.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1550', 100, 0], ['1513', 0, 100]]);
  });

  it('refuses when accumulated depreciation exceeds cost (Case 3) and never adjusts the amounts', () => {
    const plan = planPpeRetirement(balance(1, 100, 150), 1, '2026-10-12');
    expect(plan.kind).toBe('negative');
    expect(plan.lines).toEqual([]);
    expect(plan.error).toContain('accumulated depreciation exceeds the original cost');
  });

  it('takes the exact remaining amounts when every unit goes, and checks the quantity', () => {
    const plan = planPpeRetirement(balance(3, 100, 10), 3, '2026-10-12');
    expect(plan).toMatchObject({ cost: 100, accumulatedDepreciation: 10, netBookValue: 90 });
    expect(planPpeRetirement(balance(3, 100, 10), 4, '2026-10-12').error).toContain('available quantity of 3');
    expect(planPpeRetirement(balance(3, 100, 10), 0, '2026-10-12').error).toBeDefined();
    expect(planPpeRetirement(balance(3, 100, 10), 1.5, '2026-10-12').error).toBeDefined();
  });
});

describe('the Retirement of PPE and Return of Advances tabs', () => {
  let renderer: ReactTestRenderer;
  let finance: ReturnType<typeof useFinance>;
  let Page: () => ReturnType<typeof createElement> | null = () => createElement('div');
  let autoPost = false;
  let posted: string[] = [];
  let saved = 0;
  function Probe() { finance = useFinance(); return createElement(Page); }
  afterEach(() => { if (renderer) act(() => renderer.unmount()); });
  const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ');
  const draftProps = (category: string) => ({
    draftToResume: finance.draftTransactions.find(draft => draft.category === category) || null,
    autoPostDraft: autoPost, onDraftSaved: () => { saved += 1; }, onDraftPosted: (message: string) => { posted.push(message); },
  });
  const useRetirement = () => { Page = () => createElement(RetirementOfPpeEntry, draftProps('retirement-of-ppe')); };
  const useReturn = () => { Page = () => createElement(ReturnOfAdvancesEntry, draftProps('return-of-advances')); };
  const start = (seed: () => void, post = false) => {
    autoPost = post; posted = []; saved = 0;
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-09-01', 'capital', PROJECT, [{ accountCode: '1010', debit: 10000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 10000 }]);
      seed();
    });
  };
  const change = (type: 'select' | 'input', index: number, value: string) => act(() => { renderer.root.findAllByType(type)[index].props.onChange({ target: { value } }); });
  const submit = () => act(() => { renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  const click = (label: string) => act(() => { renderer.root.findAllByType('button').find(button => text(button).includes(label))!.props.onClick(); });

  const buyAdaptors = () => {
    finance.addJournalEntry('2026-09-02', 'Purchase of Adaptor', PROJECT, [{ accountCode: '1513', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }], undefined, undefined, meta('Purchase of Adaptor', { ppeQuantity: 5, ppeUnitCost: 100, ppeReferenceId: 'r-adaptor' }));
    finance.addJournalEntry('2026-10-01', 'Depreciation of Adaptor', PROJECT, [{ accountCode: '5090', debit: 100, credit: 0 }, { accountCode: '1550', debit: 0, credit: 100 }], undefined, undefined, meta('Depreciation of Adaptor', { ppeReferenceId: 'r-adaptor' }));
  };
  // A retirement of 1 Adaptor already saved as a draft (what Review's Continue / Post opens).
  const retirementDraft = () => {
    const entry = finance.addJournalEntry('2026-10-12', 'Retirement of PPE - Adaptor', PROJECT, [{ accountCode: '1550', debit: 20, credit: 0 }, { accountCode: '5370', debit: 80, credit: 0 }, { accountCode: '1513', debit: 0, credit: 100 }], undefined, undefined,
      meta('Retirement of PPE', { ppeItemCode: '1513', ppeReferenceId: 'r-adaptor', ppeRetiredQuantity: 1, ppeRetiredCost: 100, ppeRetiredAccumulated: 20 }), true, 'd-ret');
    finance.saveDraftTransaction({ id: 'd-ret', category: 'retirement-of-ppe', label: 'Retirement of PPE - Adaptor', formState: { itemCode: '1513', referenceChoice: 'r-adaptor', quantity: '1', date: '2026-10-12' }, journalEntryId: entry.id });
  };

  it('saves a retirement as a draft: no confirm step, the balances move right away and the note is shown', () => {
    useRetirement();
    start(buyAdaptors);
    change('select', 0, '1513');
    const page = text(renderer.root);
    expect(page).toContain('Available Quantity');
    expect(page).toMatch(/Accumulated Depreciation - Equipment\s*\(\s*Adaptor\s+only\s*\)/);
    expect(page).toContain('Save this transaction as a draft and do not post it yet');
    expect(page).toContain('Save as Draft');
    expect(page).not.toContain('Retire PPE');
    change('input', 0, '1');
    expect(text(renderer.root)).toContain('Net Book Value');
    submit();
    expect(text(renderer.root)).not.toContain('Confirm and retire');
    const draft = finance.journalEntries.find(entry => entry.transactionType === 'Retirement of PPE')!;
    expect(draft.isDraft).toBe(true);
    expect(draft.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1550', 20, 0], ['5370', 80, 0], ['1513', 0, 100]]);
    expect(finance.draftTransactions).toHaveLength(1);
    expect(finance.draftTransactions[0]).toMatchObject({ category: 'retirement-of-ppe', journalEntryId: draft.id });
    expect(saved).toBe(1);
    expect(finance.accountBalances['1513']).toBe(400);
    const left = buildPpeReferences(finance.journalEntries, finance.openingBalances).find(reference => reference.item.code === '1513')!;
    expect(left).toMatchObject({ quantity: 4, cost: 400, accumulatedDepreciation: 80, netBookValue: 320 });

    // Saving again replaces the same draft entry instead of adding another one.
    change('input', 0, '2');
    submit();
    expect(finance.draftTransactions).toHaveLength(1);
    expect(finance.journalEntries.filter(entry => entry.transactionType === 'Retirement of PPE')).toHaveLength(1);
    expect(finance.journalEntries.find(entry => entry.transactionType === 'Retirement of PPE')!.id).toBe(draft.id);
    expect(finance.accountBalances['1513']).toBe(300);
  });

  it('posting the saved draft from Review confirms the loss, then posts the same entry and clears the draft', () => {
    useRetirement();
    start(() => { buyAdaptors(); retirementDraft(); }, true);
    expect(text(renderer.root)).toContain('remaining book value of');
    expect(posted).toEqual([]);
    expect(finance.journalEntries.find(entry => entry.transactionType === 'Retirement of PPE')!.isDraft).toBe(true);
    click('Confirm and retire');
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    const retirement = finance.journalEntries.filter(entry => entry.transactionType === 'Retirement of PPE');
    expect(retirement).toHaveLength(1);
    expect(retirement[0].isDraft).toBeFalsy();
    expect(finance.accountBalances['1513']).toBe(400);
    expect(finance.accountBalances['5370']).toBe(80);
  });

  it('asks which purchase to retire when an item has several, and changes only that one', () => {
    useRetirement();
    start(() => {
      finance.addJournalEntry('2026-09-02', 'Purchase Chairs', PROJECT, [{ accountCode: '1652', debit: 750, credit: 0 }, { accountCode: '1010', debit: 0, credit: 750 }], undefined, undefined, meta('Purchase Chairs', { ppeQuantity: 3, ppeUnitCost: 250, ppeReferenceId: 'r1' }));
      finance.addJournalEntry('2026-09-03', 'Purchase Chairs', PROJECT, [{ accountCode: '1652', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }], undefined, undefined, meta('Purchase Chairs', { ppeQuantity: 1, ppeUnitCost: 300, ppeReferenceId: 'r2' }));
      finance.addJournalEntry('2026-10-01', 'Depreciation of Chairs', PROJECT, [{ accountCode: '5095', debit: 150, credit: 0 }, { accountCode: '1660', debit: 0, credit: 150 }], undefined, undefined, meta('Depreciation of Chairs', { ppeReferenceId: 'r1' }));
    });
    change('select', 0, '1652');
    expect(text(renderer.root)).not.toContain('Available Quantity');
    change('select', 1, 'r1');
    expect(text(renderer.root)).toContain('Remaining Original Cost');
    change('input', 0, '1');
    submit();
    const retirement = finance.journalEntries.find(entry => entry.transactionType === 'Retirement of PPE')!;
    expect(retirement.transactionDetails).toMatchObject({ ppeReferenceId: 'r1', ppeRetiredQuantity: 1, ppeRetiredCost: 250, ppeRetiredAccumulated: 50 });
    const references = buildPpeReferences(finance.journalEntries, finance.openingBalances);
    expect(references.find(reference => reference.referenceId === 'r1')).toMatchObject({ quantity: 2, cost: 500, accumulatedDepreciation: 100 });
    expect(references.find(reference => reference.referenceId === 'r2')).toMatchObject({ quantity: 1, cost: 300, accumulatedDepreciation: 0 });
  });

  it('can retire a purchase that is only saved as a draft, and does not offer an item that has been fully disposed of', () => {
    useRetirement();
    start(() => {
      finance.addJournalEntry('2026-09-02', 'Purchase of Adaptor', PROJECT, [{ accountCode: '1513', debit: 200, credit: 0 }, { accountCode: '1010', debit: 0, credit: 200 }], undefined, undefined, meta('Purchase of Adaptor', { ppeQuantity: 2, ppeUnitCost: 100, ppeReferenceId: 'r-draft' }), true, 'd-buy');
    });
    expect(renderer.root.findAllByType('option').map(option => text(option))).toContain('Adaptor');
    act(() => { finance.addJournalEntry('2026-10-02', 'Retirement of PPE - Adaptor', PROJECT, [{ accountCode: '1513', debit: 0, credit: 200 }, { accountCode: '5370', debit: 200, credit: 0 }], undefined, undefined, meta('Retirement of PPE', { ppeItemCode: '1513', ppeReferenceId: 'r-draft', ppeRetiredQuantity: 2, ppeRetiredCost: 200, ppeRetiredAccumulated: 0 }), true, 'd-ret2'); });
    expect(renderer.root.findAllByType('option').map(option => text(option))).toEqual(['No PPE item has a remaining quantity']);
  });

  const advances = () => {
    finance.addJournalEntry('2026-09-05', 'Advance to Alpha', PROJECT, [{ accountCode: '1250', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }], undefined, undefined, meta('Cash Advance to Officer', { counterpartyName: 'Alpha' }));
    finance.addJournalEntry('2026-09-06', 'Advance to Beta', PROJECT, [{ accountCode: '1250', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }], undefined, undefined, meta('Cash Advance to Officer', { counterpartyName: 'Beta' }));
  };

  it('shows the Return of Advances table and journal preview, and limits a return to that officer remaining advance', () => {
    useReturn();
    start(advances);
    expect(text(renderer.root)).toContain('Summary of Advances per Accountable Officer');
    expect(text(renderer.root)).toContain('Journal Entry Preview');
    expect(text(renderer.root)).toContain('Save this transaction as a draft and do not post it yet');
    change('select', 0, 'Beta');
    change('input', 0, '301');
    submit();
    expect(text(renderer.root)).toContain('cannot exceed');
    expect(finance.draftTransactions).toHaveLength(0);
    expect(finance.accountBalances['1250']).toBe(1300);
    change('input', 0, '100');
    expect(text(renderer.root)).toContain('Advances to Officers');
    submit();
    expect(finance.accountBalances['1250']).toBe(1200);
    expect(finance.accountBalances['1010']).toBe(10000 - 1300 + 100);
    const returned = finance.journalEntries.find(entry => entry.transactionType === 'Return of Advances')!;
    expect(returned.isDraft).toBe(true);
    expect(returned.transactionDetails?.counterpartyName).toBe('Beta');
    expect(returned.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1010', 100, 0], ['1250', 0, 100]]);
    expect(finance.draftTransactions).toHaveLength(1);
    expect(finance.draftTransactions[0]).toMatchObject({ category: 'return-of-advances', journalEntryId: returned.id });
    expect(saved).toBe(1);
    // Re-saving replaces the same draft, and its own amount never counts against its limit (up to the full 300).
    change('input', 0, '300');
    submit();
    expect(finance.draftTransactions).toHaveLength(1);
    expect(finance.journalEntries.filter(entry => entry.transactionType === 'Return of Advances')).toHaveLength(1);
    expect(finance.accountBalances['1250']).toBe(1000);
  });

  it('Review Post records the saved return as the same entry and clears the draft', () => {
    useReturn();
    start(() => {
      advances();
      const entry = finance.addJournalEntry('2026-10-12', 'Return of Advance - Beta', PROJECT, [{ accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '1250', debit: 0, credit: 100 }], undefined, undefined,
        meta('Return of Advances', { counterpartyName: 'Beta' }), true, 'd-ret');
      finance.saveDraftTransaction({ id: 'd-ret', category: 'return-of-advances', label: 'Return of Advances - Beta', formState: { officer: 'Beta', amount: '100', date: '2026-10-12' }, journalEntryId: entry.id });
    }, true);
    expect(posted).toHaveLength(1);
    expect(finance.draftTransactions).toHaveLength(0);
    const returns = finance.journalEntries.filter(entry => entry.transactionType === 'Return of Advances');
    expect(returns).toHaveLength(1);
    expect(returns[0].isDraft).toBeFalsy();
    expect(finance.accountBalances['1250']).toBe(1200);
  });

  it('shows the remaining advance after a saved return when the form is opened fresh', () => {
    useReturn();
    start(() => {
      advances();
      finance.addJournalEntry('2026-10-12', 'Return of Advance - Beta', PROJECT, [{ accountCode: '1010', debit: 100, credit: 0 }, { accountCode: '1250', debit: 0, credit: 100 }], undefined, undefined, meta('Return of Advances', { counterpartyName: 'Beta' }), true, 'd-x');
    });
    expect(renderer.root.findAllByType('option').map(option => text(option)).some(label => label.includes('Beta') && label.includes('200.00'))).toBe(true);
  });
});
