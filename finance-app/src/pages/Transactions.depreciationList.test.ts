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
function Page() { finance = useFinance(); return createElement(TransactionsPage, { onDraftSaved: () => undefined, onDraftPosted: () => undefined }); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');

const openDepreciation = () => {
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Page))); });
  act(() => { finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never); });
  act(() => { renderer.root.findAllByType('button').find(button => text(button).includes('Depreciation Non-cash'))!.props.onClick(); });
  const input = () => renderer.root.findAllByType('input').find(item => String(item.props.placeholder).startsWith('Search a transaction type'))!;
  act(() => { input().props.onFocus(); });
  return input;
};
const options = () => renderer.root.findAllByType('button').map(button => text(button).trim()).filter(label => label.startsWith('Depreciation of '));

describe('Depreciation type list', () => {
  it('is never empty: every depreciable item is listed even before anything was purchased', () => {
    openDepreciation();
    expect(text(renderer.root)).not.toContain('No matching type');
    expect(options()).toEqual(expect.arrayContaining(['Depreciation of Laptop', 'Depreciation of Microphone', 'Depreciation of Chairs', 'Depreciation of Tables/Desk']));
  });

  it('explains that a purchase is needed when the chosen item has none yet', () => {
    const input = openDepreciation();
    act(() => { input().props.onChange({ target: { value: 'Depreciation of Chairs' } }); });
    expect(text(renderer.root)).toContain('There is no purchase of this item with a balance left to depreciate yet.');
  });
});
