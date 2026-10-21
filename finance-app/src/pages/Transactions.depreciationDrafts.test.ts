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
const PROJECT = 'General Fund Operations';
function Probe() {
  finance = useFinance();
  return createElement(TransactionsPage, { onDraftSaved: () => undefined, onDraftPosted: () => undefined });
}
afterEach(() => { vi.unstubAllGlobals(); if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const meta = (type: string, details: Record<string, unknown>) => ({ transactionType: type, details: { eventRelated: false, receiptAttachmentIds: [], ...details } as never });

function start() {
  vi.stubGlobal('window', { requestAnimationFrame: (callback: () => void) => callback() });
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe)), { createNodeMock: () => ({ scrollIntoView: () => undefined, focus: () => undefined }) }); });
  act(() => { finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never); });
}
const draftEntry = (type: string, lines: { accountCode: string; debit: number; credit: number }[], details: Record<string, unknown>) =>
  act(() => { finance.addJournalEntry('2026-10-12', type, PROJECT, lines, undefined, undefined, meta(type, details), true, `d-${type}`); });
const offered = () => {
  act(() => { renderer.root.findByProps({ id: 'transaction-type-search' }).props.onChange({ target: { value: 'Depreciation of Chairs' } }); });
  return renderer.root.findAll(node => node.props.role === 'option').map(option => text(option));
};

describe('Depreciation follows PPE purchases that are only saved as drafts', () => {
  it('offers nothing to depreciate until a purchase exists', () => {
    start();
    expect(offered().filter(label => label.includes('Depreciation of Chairs'))).toEqual([]);
  });

  it('offers an item whose purchase is only a draft, and stops offering it when a draft depreciation writes it down', () => {
    start();
    draftEntry('Purchase Chairs', [{ accountCode: '1652', debit: 200, credit: 0 }, { accountCode: '1010', debit: 0, credit: 200 }], { ppeQuantity: 2, ppeUnitCost: 100, ppeReferenceId: 'r1' });
    expect(offered().some(label => label.includes('Depreciation of Chairs'))).toBe(true);

    draftEntry('Depreciation of Chairs', [{ accountCode: '5095', debit: 200, credit: 0 }, { accountCode: '1660', debit: 0, credit: 200 }], { ppeReferenceId: 'r1' });
    expect(offered().filter(label => label.includes('Depreciation of Chairs'))).toEqual([]);
  });
});
