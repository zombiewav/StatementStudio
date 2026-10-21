import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));
vi.mock('../hooks/useOtherAdjustments', () => ({ useOtherAdjustments: () => ({ status: { hasOutstanding: false, outstanding: 0 }, record: undefined, semesterKey: '', saveRecord: () => undefined }) }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(FinancialStatements); }
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ');
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.restoreAllMocks(); });

describe('Print All Financial Statements', () => {
  it('stacks all four statements, one per page, while printing', () => {
    const printed: string[][] = [];
    const print = () => { printed.push(renderer.root.findAll(node => typeof node.props['data-print-statement'] === 'string').map(node => node.props['data-print-statement'])); };
    // The tests run without a browser, so window only exists for the print call.
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Capital', 'General Fund Operations', [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]);
    });
    const button = renderer.root.findAll(node => node.type === 'button' && text(node).includes('Print All Financial Statements'))[0];
    expect(button.props.disabled).toBeFalsy();
    vi.stubGlobal('window', { print });
    act(() => { button.props.onClick(); });
    vi.unstubAllGlobals();
    expect(printed).toEqual([['position', 'activities', 'functional', 'cashflow']]);
    // Back to the normal view afterwards.
    expect(renderer.root.findAll(node => typeof node.props['data-print-statement'] === 'string')).toHaveLength(0);
  });
});
