import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { buildPpeReferences } from '../lib/ppeItems';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement('div'); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const PROJECT = 'General Fund Operations';
const meta = (type: string, details: Record<string, unknown>) => ({ transactionType: type, details: { eventRelated: false, receiptAttachmentIds: [], ...details } as never });

describe('PPE items carried into the next semester', () => {
  it('keeps each item\'s quantity, cost and depreciation when a new semester is added', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => {
      finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
      finance.addJournalEntry('2026-09-01', 'capital', PROJECT, [{ accountCode: '1010', debit: 5000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 5000 }]);
      finance.addJournalEntry('2026-09-02', 'Purchase of Adaptor', PROJECT, [{ accountCode: '1513', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }], undefined, undefined, meta('Purchase of Adaptor', { ppeQuantity: 2, ppeUnitCost: 50, ppeReferenceId: 'r-adaptor' }));
      finance.addJournalEntry('2026-09-03', 'Purchase of Cabinet', PROJECT, [{ accountCode: '1651', debit: 400, credit: 0 }, { accountCode: '1010', debit: 0, credit: 400 }], undefined, undefined, meta('Purchase of Cabinet', { ppeQuantity: 1, ppeUnitCost: 400, ppeReferenceId: 'r-cabinet' }));
      finance.addJournalEntry('2026-10-01', 'Depreciation of Cabinet', PROJECT, [{ accountCode: '5095', debit: 400, credit: 0 }, { accountCode: '1660', debit: 0, credit: 400 }], undefined, undefined, meta('Depreciation of Cabinet', { ppeReferenceId: 'r-cabinet' }));
      finance.addJournalEntry('2026-10-02', 'Depreciation of Adaptor', PROJECT, [{ accountCode: '5090', debit: 30, credit: 0 }, { accountCode: '1550', debit: 0, credit: 30 }], undefined, undefined, meta('Depreciation of Adaptor', { ppeReferenceId: 'r-adaptor' }));
    });
    act(() => { finance.switchReportingPeriod('2026-2027', '2nd Semester', 2026); });
    const balances = buildPpeReferences(finance.journalEntries, finance.openingBalances);
    expect(balances.find(reference => reference.item.code === '1513')).toMatchObject({ referenceId: 'r-adaptor', quantity: 2, unitCost: 50, cost: 100, accumulatedDepreciation: 30, netBookValue: 70 });
    // The cabinet is still held but fully depreciated, so it can no longer be depreciated.
    expect(balances.find(reference => reference.item.code === '1651')).toMatchObject({ quantity: 1, cost: 400, netBookValue: 0 });
    // The carried detail has no ledger lines, so the books themselves are untouched.
    expect(finance.accountBalances['1513']).toBe(100);
    expect(finance.accountBalances['1550']).toBe(30);
  });
});
