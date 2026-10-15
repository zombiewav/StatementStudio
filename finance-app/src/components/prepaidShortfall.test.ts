import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { PrepaidAssetEntry } from './PrepaidAssetEntry';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const CAUTION = 'The total amount paid is less than the Purchase Price of Asset. The unpaid portion will be recorded as a payable.';

describe('Prepaid Expenses and Other Assets payment caution', () => {
  let renderer: ReactTestRenderer;
  let finance: ReturnType<typeof useFinance>;
  function Probe() { finance = useFinance(); return createElement(PrepaidAssetEntry); }
  afterEach(() => { if (renderer) act(() => renderer.unmount()); });
  const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
  const selectByOption = (option: string) => renderer.root.findAllByType('select').find(select => select.findAllByType('option').some(item => item.props.value === option || text(item) === option))!;
  const setLabelInput = (label: string, value: string) => {
    const field = renderer.root.findAllByType('label').find(item => text(item).startsWith(label))!;
    act(() => { field.findByType('input').props.onChange({ target: { value } }); });
  };

  const start = () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-09-01', 'capital', 'General Fund Operations', [{ accountCode: '1010', debit: 10000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 10000 }]);
    });
    act(() => { selectByOption('Bondpaper').props.onChange({ target: { value: 'Bondpaper' } }); });
    const category = renderer.root.findAllByType('select').find(select => select.props.disabled === false && select.findAllByType('option').some(item => text(item) === 'Select a category…'))!;
    const choice = category.findAllByType('option').find(item => item.props.value)!.props.value;
    if (!category.props.value) act(() => { category.props.onChange({ target: { value: choice } }); });
  };

  it('warns when the payments are less than the purchase price', () => {
    start();
    setLabelInput('Purchase price', '1000');
    expect(text(renderer.root)).toContain(CAUTION);
    const rows = renderer.root.findAll(node => node.type === 'input' && node.props.placeholder === 'Amount');
    act(() => { rows[0].props.onChange({ target: { value: '400' } }); });
    expect(text(renderer.root)).toContain(CAUTION);
    act(() => { renderer.root.findAll(node => node.type === 'input' && node.props.placeholder === 'Amount')[0].props.onChange({ target: { value: '1000' } }); });
    expect(text(renderer.root)).not.toContain(CAUTION);
  });

  it('shows no caution when the purchase is not yet paid', () => {
    start();
    setLabelInput('Purchase price', '1000');
    act(() => { selectByOption('not-yet-paid').props.onChange({ target: { value: 'not-yet-paid' } }); });
    expect(text(renderer.root)).not.toContain(CAUTION);
  });
});
