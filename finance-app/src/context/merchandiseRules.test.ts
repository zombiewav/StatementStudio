import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from './FinanceContext';
import { categorizeTransactionRule, isRetiredMerchandisePickerType } from '../lib/transactionCategories';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));

function loadFinance() {
  let finance!: ReturnType<typeof useFinance>;
  function Probe() { finance = useFinance(); return null; }
  act(() => { create(createElement(FinanceProvider, null, createElement(Probe))); });
  return finance;
}
const pickerTitles = (finance: ReturnType<typeof useFinance>) => finance.classificationRules
  .filter(rule => categorizeTransactionRule(rule) === 'merchandise' && !isRetiredMerchandisePickerType(rule.description))
  .map(rule => rule.description);

describe('merchandise transaction types', () => {
  it('lists the supplier downpayment under its new title and hides the old one', () => {
    const finance = loadFinance();
    expect(pickerTitles(finance)).toContain('Downpayment to Suppliers for Pre-Ordered Merchandise');
    expect(pickerTitles(finance)).not.toContain('Downpayment for Pre-ordered Merchandise');
  });

  it('classifies both the new and the former title as Dr Advances to Suppliers / Cr Cash', () => {
    const finance = loadFinance();
    expect(finance.suggestTransactionClassification('Downpayment to Suppliers for Pre-Ordered Merchandise')).toMatchObject({ debitAccountCode: '1270', creditAccountCode: '1010' });
    expect(finance.suggestTransactionClassification('Downpayment for Pre-ordered Merchandise')).toMatchObject({ debitAccountCode: '1270', creditAccountCode: '1010' });
  });
});
