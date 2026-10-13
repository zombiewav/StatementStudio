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

  it('offers Downpayment by Buyer for Pre-Ordered Merchandise as Dr Cash / Cr Unearned Merchandise Revenue', () => {
    const finance = loadFinance();
    expect(pickerTitles(finance)).toContain('Downpayment by Buyer for Pre-Ordered Merchandise');
    expect(finance.suggestTransactionClassification('Downpayment by Buyer for Pre-Ordered Merchandise')).toMatchObject({ debitAccountCode: '1010', creditAccountCode: '2140' });
    expect(finance.accounts.find(account => account.code === '2140')?.name).toBe('Unearned Merchandise Revenue');
    expect(finance.accounts.find(account => account.code === '2150')?.name).toBe('Refund Liability - Merchandise');
  });

  it('offers Excess Merchandise Collection - Status as Dr Refund Liability - Merchandise / Cr Cash', () => {
    const finance = loadFinance();
    expect(pickerTitles(finance)).toContain('Excess Merchandise Collection - Status');
    expect(finance.suggestTransactionClassification('Excess Merchandise Collection - Status')).toMatchObject({ debitAccountCode: '2150', creditAccountCode: '1010' });
  });

  it('classifies both the new and the former title as Dr Advances to Suppliers / Cr Cash', () => {
    const finance = loadFinance();
    expect(finance.suggestTransactionClassification('Downpayment to Suppliers for Pre-Ordered Merchandise')).toMatchObject({ debitAccountCode: '1270', creditAccountCode: '1010' });
    expect(finance.suggestTransactionClassification('Downpayment for Pre-ordered Merchandise')).toMatchObject({ debitAccountCode: '1270', creditAccountCode: '1010' });
  });
});
