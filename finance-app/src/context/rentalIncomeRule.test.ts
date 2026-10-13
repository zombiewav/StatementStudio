import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from './FinanceContext';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));

describe('Other Rental Income Received rule', () => {
  it('is listed under that title and still posts Dr Cash / Cr Rental Income', () => {
    let finance!: ReturnType<typeof useFinance>;
    function Probe() { finance = useFinance(); return null; }
    act(() => { create(createElement(FinanceProvider, null, createElement(Probe))); });
    const titles = finance.classificationRules.map(rule => rule.description);
    expect(titles).toContain('Other Rental Income Received');
    expect(titles).not.toContain('Rental Income Received');
    expect(finance.suggestTransactionClassification('Other Rental Income Received')).toMatchObject({ debitAccountCode: '1010', creditAccountCode: '4055' });
  });
});
