import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));
// The Cash answer of Other Adjustments: 2,500 of the 4,000 cash balance is held in bank accounts / e-wallets.
vi.mock('../hooks/useOtherAdjustments', () => ({
  useOtherAdjustments: () => ({
    status: { hasOutstanding: false, outstanding: 0, cash: { balance: 4000, declared: 2500, required: true, outstanding: false, updated: true, remainingCash: 1500 } },
    record: undefined, semesterKey: '', saveRecord: () => undefined,
  }),
}));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(FinancialStatements); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');

describe('Statement of Financial Position - Cash split from Other Adjustments', () => {
  it('shows the bank/e-wallet answer as Cash in Bank and the rest as Cash on Hand', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-10-01', 'Capital', 'General Fund Operations', [{ accountCode: '1010', debit: 4000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 4000 }]);
    });
    const page = text(renderer.root);
    expect(page).toMatch(/Cash on Hand\s*₱1,500\.00/);
    expect(page).toMatch(/Cash in Bank\s*₱2,500\.00/);
    expect(page).toMatch(/Total Assets\s*₱4,000\.00/);
  });
});
