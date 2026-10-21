import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));
// These tests are about the statements themselves; the Other Adjustments gate has its own tests (FinancialStatements.adjustmentsGate.test.ts).
vi.mock('../hooks/useOtherAdjustments', () => ({ useOtherAdjustments: () => ({ status: { hasOutstanding: false, outstanding: 0 }, record: undefined, semesterKey: '', saveRecord: () => undefined }) }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(FinancialStatements); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');

describe('Statement of Financial Position - Property and Equipment', () => {
  it('lists equipment and furniture items under Property and Equipment, not Other Assets', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Capital', 'General Fund Operations', [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]);
      finance.addJournalEntry('2026-10-02', 'Microphone', 'General Fund Operations', [{ accountCode: '1508', debit: 600, credit: 0 }, { accountCode: '1010', debit: 0, credit: 600 }]);
      finance.addJournalEntry('2026-10-03', 'Chairs', 'General Fund Operations', [{ accountCode: '1652', debit: 150, credit: 0 }, { accountCode: '1010', debit: 0, credit: 150 }]);
      finance.addJournalEntry('2026-10-04', 'Depreciation', 'General Fund Operations', [{ accountCode: '5090', debit: 30, credit: 0 }, { accountCode: '1550', debit: 0, credit: 30 }]);
    });
    const page = text(renderer.root);
    const ppe = page.indexOf('Property and Equipment');
    expect(ppe).toBeGreaterThan(-1);
    expect(page).not.toContain('Other Assets');
    ['Microphone', 'Less: Accumulated Depreciation - Equipment', 'Chairs'].forEach(label => expect(page.indexOf(label)).toBeGreaterThan(ppe));
    expect(page.indexOf('Total Assets')).toBeGreaterThan(page.indexOf('Chairs'));
  });

  it('separates Equipment and Furniture and Fixtures, each ending with its own accumulated depreciation', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Capital', 'General Fund Operations', [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]);
      finance.addJournalEntry('2026-10-02', 'Microphone', 'General Fund Operations', [{ accountCode: '1508', debit: 600, credit: 0 }, { accountCode: '1010', debit: 0, credit: 600 }]);
      finance.addJournalEntry('2026-10-03', 'Chairs', 'General Fund Operations', [{ accountCode: '1652', debit: 150, credit: 0 }, { accountCode: '1010', debit: 0, credit: 150 }]);
      finance.addJournalEntry('2026-10-04', 'Depreciation', 'General Fund Operations', [{ accountCode: '5090', debit: 30, credit: 0 }, { accountCode: '1550', debit: 0, credit: 30 }]);
      finance.addJournalEntry('2026-10-05', 'Depreciation', 'General Fund Operations', [{ accountCode: '5095', debit: 20, credit: 0 }, { accountCode: '1660', debit: 0, credit: 20 }]);
    });
    const page = text(renderer.root);
    const at = (label: string) => page.indexOf(label);
    const order = ['Equipment Microphone', 'Less: Accumulated Depreciation - Equipment', 'Furniture and Fixtures Chairs', 'Less: Accumulated Depreciation - Furniture and Fixtures', 'Total Assets'].map(at);
    expect(order.every(index => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
