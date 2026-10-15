import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { RetirementOfPpeEntry } from './RetirementOfPpeEntry';
import { ReturnOfAdvancesEntry } from './ReturnOfAdvancesEntry';
import { buildPpeItemBalances, planPpeRetirement } from '../lib/ppeItems';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const PROJECT = 'General Fund Operations';
const meta = (type: string, details: Record<string, unknown> = {}) => ({ transactionType: type, details: { eventRelated: false, receiptAttachmentIds: [], ...details } as never });
const balance = (quantity: number, cost: number, accumulatedDepreciation: number) => ({
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
  function Probe() { finance = useFinance(); return createElement(Page); }
  afterEach(() => { if (renderer) act(() => renderer.unmount()); });
  const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ');
  const start = (seed: () => void) => {
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
    finance.addJournalEntry('2026-09-02', 'Purchase of Adaptor', PROJECT, [{ accountCode: '1513', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }], undefined, undefined, meta('Purchase of Adaptor', { ppeQuantity: 5 }));
    finance.addJournalEntry('2026-10-01', 'Depreciation of Adaptor', PROJECT, [{ accountCode: '5090', debit: 100, credit: 0 }, { accountCode: '1550', debit: 0, credit: 100 }], undefined, undefined, meta('Depreciation of Adaptor'));
  };

  it('retires part of an item after the user confirms, and the item keeps what is left', () => {
    Page = RetirementOfPpeEntry as never;
    start(buyAdaptors);
    change('select', 0, '1513');
    const page = text(renderer.root);
    expect(page).toContain('Available Quantity');
    expect(page).toMatch(/Accumulated Depreciation - Equipment\s*\(\s*Adaptor\s*\)/);
    change('input', 0, '1');
    expect(text(renderer.root)).toContain('Net Book Value');
    submit();
    expect(text(renderer.root)).toContain('remaining book value of');
    expect(finance.journalEntries.some(entry => entry.transactionType === 'Retirement of PPE')).toBe(false);
    click('Confirm and retire');
    const retirement = finance.journalEntries.find(entry => entry.transactionType === 'Retirement of PPE')!;
    expect(retirement.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1550', 20, 0], ['5370', 80, 0], ['1513', 0, 100]]);
    expect(finance.accountBalances['1513']).toBe(400);
    expect(finance.accountBalances['1550']).toBe(80);
    expect(finance.accountBalances['5370']).toBe(80);
    const left = buildPpeItemBalances(finance.journalEntries, finance.openingBalances).find(item => item.item.code === '1513')!;
    expect(left).toMatchObject({ quantity: 4, cost: 400, accumulatedDepreciation: 80, netBookValue: 320 });
  });

  it('does not offer an item that has been fully disposed of', () => {
    Page = RetirementOfPpeEntry as never;
    start(() => {
      buyAdaptors();
      finance.addJournalEntry('2026-10-02', 'Retirement of PPE - Adaptor', PROJECT, [{ accountCode: '1550', debit: 100, credit: 0 }, { accountCode: '5370', debit: 400, credit: 0 }, { accountCode: '1513', debit: 0, credit: 500 }], undefined, undefined, meta('Retirement of PPE', { ppeItemCode: '1513', ppeRetiredQuantity: 5, ppeRetiredCost: 500, ppeRetiredAccumulated: 100 }));
    });
    expect(renderer.root.findAllByType('option').map(option => text(option))).toEqual(['No PPE item has a remaining quantity']);
  });

  it('shows the Return of Advances table and limits a return to that officer\'s remaining advance', () => {
    Page = ReturnOfAdvancesEntry as never;
    start(() => {
      finance.addJournalEntry('2026-09-05', 'Advance to Alpha', PROJECT, [{ accountCode: '1250', debit: 1000, credit: 0 }, { accountCode: '1010', debit: 0, credit: 1000 }], undefined, undefined, meta('Cash Advance to Officer', { counterpartyName: 'Alpha' }));
      finance.addJournalEntry('2026-09-06', 'Advance to Beta', PROJECT, [{ accountCode: '1250', debit: 300, credit: 0 }, { accountCode: '1010', debit: 0, credit: 300 }], undefined, undefined, meta('Cash Advance to Officer', { counterpartyName: 'Beta' }));
    });
    expect(text(renderer.root)).toContain('Summary of Advances per Accountable Officer');
    change('select', 0, 'Beta');
    change('input', 0, '301');
    submit();
    expect(text(renderer.root)).toContain('cannot exceed');
    expect(finance.accountBalances['1250']).toBe(1300);
    change('input', 0, '100');
    submit();
    expect(finance.accountBalances['1250']).toBe(1200);
    expect(finance.accountBalances['1010']).toBe(10000 - 1300 + 100);
    const returned = finance.journalEntries.find(entry => entry.transactionType === 'Return of Advances')!;
    expect(returned.transactionDetails?.counterpartyName).toBe('Beta');
    expect(returned.lines.map(line => [line.accountCode, line.debit, line.credit])).toEqual([['1010', 100, 0], ['1250', 0, 100]]);
  });
});
