import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(FinancialStatements); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const start = () => {
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.addJournalEntry('2026-10-01', 'capital', 'General Fund Operations', [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 1000 }]);
  });
};

describe('Financial Statements need every transaction posted', () => {
  it('always shows the note that all transactions must be posted first', () => {
    start();
    expect(text(renderer.root)).toContain('All transactions must be posted first before the Financial Statements can be generated');
  });

  it('does not generate while a draft is waiting, and generates once it is gone', () => {
    start();
    expect(text(renderer.root)).toContain('As of');
    act(() => { finance.saveDraftTransaction({ id: 'd1', category: 'merchandise', label: 'Sale of Merchandise', formState: {} }); });
    const gated = text(renderer.root);
    expect(gated).toContain("Statements aren't ready yet");
    expect(gated).toContain('1 draft transaction still needs to be posted');
    expect(gated).toContain('Sale of Merchandise');
    expect(renderer.root.findAllByType('button').filter(button => /Print Statement|Export PDF|Export Excel/.test(text(button))).every(button => button.props.disabled)).toBe(true);
    act(() => { finance.deleteDraftTransaction('d1'); });
    expect(text(renderer.root)).not.toContain("Statements aren't ready yet");
    expect(text(renderer.root)).toContain('As of');
  });
});
