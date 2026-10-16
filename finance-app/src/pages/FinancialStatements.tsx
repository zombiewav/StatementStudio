import React, { useState, useMemo, useEffect } from 'react';
import { pendingDraftLabels } from '../lib/statementReadiness';
import {
  Printer,
  Calendar,
  Eye,
  ClipboardCheck
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import type { Account } from '../types';
import { computeActivitiesExpenseBreakdown } from '../lib/activitiesBreakdown';
import { computeAccountBalances, computeTypeTotals, isContraAccount } from '../lib/accountTotals';
import { computeTransactionReviewStates } from '../lib/reviewEngine';
import { buildCashFlowStatement, EQUIPMENT_PURCHASE_LABEL, FURNITURE_PURCHASE_LABEL, netCashLabel } from '../lib/cashFlowStatement';
import { CASH_ACCOUNT_CODES } from '../lib/cashAccounts';
import { accumulatedNetPosition } from '../lib/fundBalancePresentation';
import { excludeClosingEntries } from '../lib/closingEntries';
import { periodEndedLabel, periodForSemester, reportingPeriodBounds } from '../lib/reportingPeriod';
import { combineOpeningAndPeriodBalances } from '../lib/reportingPeriodBalances';

/** A balance counts as shown only when it is not zero (cents rounding ignored). */
const hasBalance = (amount: number | undefined): boolean => Math.abs(amount || 0) >= 0.005;

type ActiveStatementTab = 'position' | 'activities' | 'functional' | 'cashflow';

const STATEMENT_OPTIONS: { id: ActiveStatementTab; label: string }[] = [
  { id: 'position', label: 'Financial Position' },
  { id: 'activities', label: 'Activities' },
  { id: 'functional', label: 'Functional Expenses' },
  { id: 'cashflow', label: 'Cash Flows' },
];

export function FinancialStatements(): React.ReactElement {
  const { 
    accounts, 
    journalEntries, 
    closedFiscalYears,
    formatCurrency, 
    settings,
    openingBalances,
    draftTransactions,
    recordFinancialStatementHistory,
  } = useFinance();

  const [activeTab, setActiveTab] = useState<ActiveStatementTab>('position');
  const [selectedStatements, setSelectedStatements] = useState<Record<ActiveStatementTab, boolean>>({
    position: true,
    activities: true,
    functional: true,
    cashflow: true,
  });
  // The statements cover the active semester (1st: ends December 31; 2nd: ends May 31) until the dates are changed.
  const semesterBounds = settings.semester && settings.reportingYear ? reportingPeriodBounds(settings.semester, settings.reportingYear) : null;
  const [startDate, setStartDate] = useState(semesterBounds?.startDate ?? '2026-01-01');
  const [endDate, setEndDate] = useState(semesterBounds?.endDate ?? '2026-12-31');
  useEffect(() => {
    if (!settings.semester || !settings.reportingYear) return;
    const bounds = reportingPeriodBounds(settings.semester, settings.reportingYear);
    setStartDate(bounds.startDate);
    setEndDate(bounds.endDate);
  }, [settings.semester, settings.reportingYear]);
  const selectedStatementCount = Object.values(selectedStatements).filter(Boolean).length;

  const toggleStatement = (statement: ActiveStatementTab) => {
    if (selectedStatements[statement] && selectedStatementCount === 1) return;
    const next = { ...selectedStatements, [statement]: !selectedStatements[statement] };
    setSelectedStatements(next);
    if (activeTab === statement && !next[statement]) {
      setActiveTab(STATEMENT_OPTIONS.find(option => next[option.id])?.id || 'position');
    }
  };

  // Apply Date Range Filter on Entries
  const filteredEntries = useMemo(() => {
    return journalEntries.filter(je => !je.isDraft && je.date >= startDate && je.date <= endDate);
  }, [journalEntries, startDate, endDate]);

  // Closing entries stay in the ledger and point-in-time Balance Sheet, but
  // must not erase or reclassify the original Revenue/Expense activity on
  // the Statement of Activities and Changes in Fund Balance.
  const performanceEntries = useMemo(
    () => excludeClosingEntries(filteredEntries, closedFiscalYears),
    [filteredEntries, closedFiscalYears]
  );

  // Year-end gate: every REVIEW item has to be resolved before statements
  // can be generated — an unresolved item (e.g. a donation not yet
  // released, supplies not yet fully used) means part of the books is
  // still an open question, not something a finished statement should
  // paper over. Checked against ALL entries, not just the filtered range,
  // since an open item from outside the selected period can still mean
  // the period's own numbers (a receivable, a prepaid balance) aren't
  // final yet either.
  const semesterKey = `${settings.reportingYear}::${settings.semester}`;
  const incompleteReviewItems = useMemo(
    () => computeTransactionReviewStates(journalEntries.filter(entry => !entry.isDraft), accounts, semesterKey).filter(item => item.status === 'incomplete' && item.blocksStatements !== false),
    [journalEntries, accounts, semesterKey]
  );

  // Compute Account Balances specifically for the filtered date range —
  // right for Revenue/Expenses (a period's activity), but NOT for Assets,
  // Liabilities, or Fund Balance: those are point-in-time balances, and
  // filtering them to just the selected range would drop everything
  // carried over from before the range started (see cumulativeToEndTotals
  // below, which is what the Balance Sheet actually uses).
  const filteredBalances = useMemo(
    () => computeAccountBalances(performanceEntries, accounts),
    [performanceEntries, accounts]
  );

  // Compute Statements totals from filtered balances
  const filteredTotals = useMemo(
    () => computeTypeTotals(filteredBalances, accounts),
    [filteredBalances, accounts]
  );

  // Includes closing entries. This is intentionally separate from the
  // performance totals above so a closed surplus is not counted once in
  // Fund Balance and again as current-period net income on the Balance Sheet.
  const ledgerPeriodTotals = useMemo(
    () => computeTypeTotals(computeAccountBalances(filteredEntries, accounts), accounts),
    [filteredEntries, accounts]
  );

  // Balance Sheet accounts (Assets/Liabilities/Fund Balance) as of the
  // report's end date, including everything posted before the selected
  // range — e.g. prior years' closing entries — not just activity within
  // it. Point-in-time balances, unlike Revenue/Expenses.
  const cumulativeToEndEntries = useMemo(
    () => journalEntries.filter(je => !je.isDraft && je.date <= endDate),
    [journalEntries, endDate]
  );
  const cumulativeToEndBalances = useMemo(
    () => combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(cumulativeToEndEntries, accounts), accounts),
    [openingBalances, cumulativeToEndEntries, accounts]
  );
  const cumulativeToEndTotals = useMemo(
    () => computeTypeTotals(cumulativeToEndBalances, accounts),
    [cumulativeToEndBalances, accounts]
  );

  // The Statement of Changes in Fund Balance's own "starting balance" is a
  // different point in time — as of just before the range began, not its
  // end — so it needs its own cumulative snapshot.
  const beginningFundBalance = useMemo(() => {
    const priorEntries = journalEntries.filter(je => !je.isDraft && je.date < startDate);
    return computeTypeTotals(combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(priorEntries, accounts), accounts), accounts)['Fund Balance'];
  }, [journalEntries, startDate, accounts, openingBalances]);

  const fNetIncome = filteredTotals.Revenue - filteredTotals.Expenses;
  const unclosedNetIncome = ledgerPeriodTotals.Revenue - ledgerPeriodTotals.Expenses;
  // A surplus reads as a credit (positive); a deficit as a debit (negative) in Net Assets.
  const accumulatedNet = accumulatedNetPosition(unclosedNetIncome);
  const fEndingFundBalance = cumulativeToEndTotals['Fund Balance'] + unclosedNetIncome;
  const fTotalLiabilitiesAndFund = cumulativeToEndTotals.Liabilities + fEndingFundBalance;

  // Splits Operating Expenses on the Statement of Activities into
  // Event-Related (grouped by the specific event name entered on the
  // Transactions form) versus General & Administrative — see
  // computeActivitiesExpenseBreakdown for the rule.
  const activitiesExpenseBreakdown = useMemo(
    () => computeActivitiesExpenseBreakdown(performanceEntries, accounts),
    [performanceEntries, accounts]
  );
  // The Statement of Functional Expenses lists only expenses that have a balance.
  const functionalExpenseAccounts = useMemo(
    () => accounts.filter(account => account.type === 'Expenses' && (
      (activitiesExpenseBreakdown.generalAdminByAccount[account.code] || 0) !== 0
      || activitiesExpenseBreakdown.eventNames.some(name => (activitiesExpenseBreakdown.eventGroups[name][account.code] || 0) !== 0)
    )),
    [accounts, activitiesExpenseBreakdown]
  );
  const negativeBalanceAccounts = useMemo(
    // A Fund Balance below zero is a deficit, which the closing entry produces on purpose.
    () => accounts.filter(account => account.type !== 'Fund Balance' && (cumulativeToEndBalances[account.code] || 0) < -0.005),
    [accounts, cumulativeToEndBalances]
  );
  // Client rule (Oct 2026): nothing may still be waiting as a draft when the statements are generated.
  const pendingDrafts = useMemo(() => pendingDraftLabels(draftTransactions, journalEntries), [draftTransactions, journalEntries]);
  const isGated = incompleteReviewItems.length > 0 || negativeBalanceAccounts.length > 0 || pendingDrafts.length > 0;
  const positionAssetGroups = useMemo(() => {
    const groups: Array<[string, string[]]> = [
      ['Cash and Cash Equivalents', ['1010', '1015']], ['Receivables', ['1200', '1300', '1310', '1330', '1360', '1370']], ['Advances and Dues', ['1250', '1270', '1320']], ['Inventories', ['1700']], ['Prepaid Expenses and Other Assets', ['1260', '1280', '1285', '1295', '1298']], ['Property and Equipment', ['1500', '1550', '1660']],
    ];
    const assigned = new Set(groups.flatMap(([, codes]) => codes));
    // Accounts with a zero balance are left off the statement, and a heading with no accounts left goes with them.
    const visible = (list: Account[]) => list.filter(account => hasBalance(cumulativeToEndBalances[account.code]));
    const grouped = [...groups.map(([label, codes]) => [label, visible(accounts.filter(account => codes.includes(account.code)))] as const), ['Other Assets', visible(accounts.filter(account => account.type === 'Assets' && !assigned.has(account.code)))] as const];
    return grouped.filter(([, list]) => list.length > 0);
  }, [accounts, cumulativeToEndBalances]);
  const positionLiabilityGroups = useMemo(() => {
    const groups: Array<[string, string[]]> = [
      ['Dues and Payables', ['2010', '2020', '2030', '2040', '2050', '2061', '2062', '2063', '2064', '2070', '2080']], ['Unearned Revenues', ['2110', '2140']], ['Refund Liabilities', ['2120', '2130', '2150']],
    ];
    const assigned = new Set(groups.flatMap(([, codes]) => codes));
    const visible = (list: Account[]) => list.filter(account => hasBalance(cumulativeToEndBalances[account.code]));
    const grouped = groups.map(([label, codes]) => [label, visible(accounts.filter(account => codes.includes(account.code)))] as const);
    const other = visible(accounts.filter(account => account.type === 'Liabilities' && !assigned.has(account.code)));
    return (other.length ? [...grouped, ['Other Liabilities', other] as const] : grouped).filter(([, list]) => list.length > 0);
  }, [accounts, cumulativeToEndBalances]);
  const positionFundBalanceAccounts = useMemo(
    () => accounts.filter(account => account.type === 'Fund Balance' && hasBalance(cumulativeToEndBalances[account.code])),
    [accounts, cumulativeToEndBalances]
  );
  const activitiesRevenueAccounts = useMemo(
    () => accounts.filter(account => account.type === 'Revenue' && hasBalance(filteredBalances[account.code])),
    [accounts, filteredBalances]
  );
  const activitiesGeneralAdminAccounts = useMemo(
    () => accounts.filter(account => account.type === 'Expenses' && hasBalance(activitiesExpenseBreakdown.generalAdminByAccount[account.code])),
    [accounts, activitiesExpenseBreakdown]
  );


  const saveFinalSnapshot = (action: 'Print') => {
    if (!settings.semester || !settings.reportingYear) return;
    const schoolYear = `${settings.reportingYear}-${settings.reportingYear + 1}`;
    recordFinancialStatementHistory({
      schoolYear,
      semester: settings.semester,
      period: periodForSemester(settings.semester),
      startDate,
      endDate,
      action,
      statements: STATEMENT_OPTIONS.filter(option => selectedStatements[option.id]).map(option => option.label),
      ledgerBalances: accounts.map(account => ({
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        normalBalance: account.normalBalance,
        balance: cumulativeToEndBalances[account.code] || 0,
      })),
      statementTotals: {
        totalAssets: cumulativeToEndTotals.Assets,
        totalLiabilities: cumulativeToEndTotals.Liabilities,
        totalFundBalance: fEndingFundBalance,
        totalRevenue: filteredTotals.Revenue,
        totalExpenses: filteredTotals.Expenses,
        netSurplus: fNetIncome,
        beginningCash: cashFlowDetails.beginningCash,
        endingCash: cashFlowDetails.endingCash,
        beginningFundBalance,
        endingFundBalance: fEndingFundBalance,
      },
    });
  };

  // Print function
  const handlePrint = () => {
    saveFinalSnapshot('Print');
    window.print();
  };

  const cashFlowDetails = useMemo(
    () => buildCashFlowStatement(
      journalEntries.filter(entry => !entry.isDraft), accounts, startDate, endDate,
      CASH_ACCOUNT_CODES.reduce((sum, code) => sum + (openingBalances[code] || 0), 0),
    ),
    [journalEntries, accounts, startDate, endDate, openingBalances]
  );
  const formatOutflow = (amount: number) => amount === 0
    ? formatCurrency(0)
    : `(${formatCurrency(Math.abs(amount))})`;

  return (
    <div className="space-y-6">
      {/* Page Title & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">Financial <em className="text-blue-700 dark:text-blue-400">Statements</em></h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Generate, inspect, and print official GAAP-compliant financial summaries.</p>
          <p role="note" className="mt-2 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Note: All transactions must be posted first before the Financial Statements can be generated. Post or delete every draft transaction and resolve every item in Review.</p>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Print Button */}
          <button
            onClick={handlePrint}
            disabled={isGated}
            className="flex items-center gap-2 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
          >
            <Printer className="w-3.5 h-3.5 text-blue-900 dark:text-blue-400" /> Print Statement
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white dark:bg-slate-900 p-4.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-400" />
          <span className="text-xs font-bold text-gray-500 dark:text-slate-400">Statement Period:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-50 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-blue-900/10 dark:focus:ring-blue-500/20 focus:bg-white dark:focus:bg-slate-900 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-200 p-2"
          />
          <span className="text-xs text-gray-400 dark:text-slate-400 font-semibold">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-50 dark:bg-slate-800 border-none outline-none focus:ring-2 focus:ring-blue-900/10 dark:focus:ring-blue-500/20 focus:bg-white dark:focus:bg-slate-900 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-200 p-2"
          />
        </div>
      </div>

      {/* Layout Grid: Left Sidebar Report Tabs, Right Report Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Navigation Tabs - Left */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1.5 print:hidden">
          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider px-3 pb-1.5 border-b border-gray-50 dark:border-slate-800 mb-1.5">Statement Reports</span>
          <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">Custom FS set</p>
              <button
                type="button"
                onClick={() => setSelectedStatements({ position: true, activities: true, functional: true, cashflow: true })}
                className="text-[9px] font-bold text-blue-700 hover:underline dark:text-blue-300"
              >
                Select all
              </button>
            </div>
            <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Choose which reports are available to generate. At least one is required.</p>
            <div className="mt-2 space-y-1.5">
              {STATEMENT_OPTIONS.map(option => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedStatements[option.id]}
                    disabled={selectedStatements[option.id] && selectedStatementCount === 1}
                    onChange={() => toggleStatement(option.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          
          <button
            onClick={() => setActiveTab('position')}
            disabled={!selectedStatements.position}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              !selectedStatements.position ? 'hidden' : activeTab === 'position' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Financial Position</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            disabled={!selectedStatements.activities}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              !selectedStatements.activities ? 'hidden' : activeTab === 'activities' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Activities</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

          <button
            onClick={() => setActiveTab('functional')}
            disabled={!selectedStatements.functional}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              !selectedStatements.functional ? 'hidden' : activeTab === 'functional' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Functional Expenses</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

          <button
            onClick={() => setActiveTab('cashflow')}
            disabled={!selectedStatements.cashflow}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              !selectedStatements.cashflow ? 'hidden' : activeTab === 'cashflow' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Cash Flows</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

        </div>

        {/* Report Canvas - Right */}
        <div className="lg:col-span-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 rounded-3xl shadow-sm print:shadow-none print:border-none max-w-4xl mx-auto w-full select-none">
          {isGated ? (
            <div className="text-center py-10 h-full flex flex-col justify-center">
              <ClipboardCheck className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Statements aren't ready yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                {negativeBalanceAccounts.length > 0
                  ? `${negativeBalanceAccounts.length} account${negativeBalanceAccounts.length === 1 ? '' : 's'} have a negative balance. Correct the previous transactions before generating financial statements.`
                  : pendingDrafts.length > 0
                  ? `${pendingDrafts.length} draft transaction${pendingDrafts.length === 1 ? '' : 's'} still ${pendingDrafts.length === 1 ? 'needs' : 'need'} to be posted. Post or delete every draft in Review, then come back here.`
                  : incompleteReviewItems.length > 0
                  ? `${incompleteReviewItems.length} item${incompleteReviewItems.length === 1 ? '' : 's'} in REVIEW still need an answer before the books are final. Resolve them in Review, then come back here.`
                  : 'Complete the three required Closing Entries stages for the active fiscal year before generating financial statements.'}
              </p>
              {negativeBalanceAccounts.length > 0 && <div className="mt-4 max-w-md mx-auto space-y-2 text-left">{negativeBalanceAccounts.map(account => <div key={account.code} className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[11px] font-semibold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">This account ({account.code} {account.name}, {formatCurrency(cumulativeToEndBalances[account.code] || 0)}) has a negative balance. Please check your previous transactions, as you may have missed something.</div>)}</div>}
              <div className="mt-6 max-w-md mx-auto text-left space-y-2">
                {pendingDrafts.slice(0, 8).map((label, index) => (
                  <div key={`draft-${index}`} className="flex justify-between items-center px-3.5 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-lg text-[11px]">
                    <span className="font-semibold text-amber-900 dark:text-amber-300 truncate pr-3">{label}</span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap">Draft</span>
                  </div>
                ))}
                {pendingDrafts.length > 8 && (
                  <p className="text-[10px] text-slate-400 text-center pt-1">+{pendingDrafts.length - 8} more drafts in Review</p>
                )}
                {incompleteReviewItems.slice(0, 8).map(item => (
                  <div key={item.entry.id} className="flex justify-between items-center px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg text-[11px]">
                    <span className="font-semibold text-rose-900 dark:text-rose-300 truncate pr-3">{item.entry.customName || item.entry.description}</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap">Incomplete</span>
                  </div>
                ))}
                {incompleteReviewItems.length > 8 && (
                  <p className="text-[10px] text-slate-400 text-center pt-1">+{incompleteReviewItems.length - 8} more in Review</p>
                )}
              </div>
            </div>
          ) : (
            <>
          {/* Report Header */}
          <div className="text-center border-b-2 border-slate-200 dark:border-slate-700 pb-5 mb-8">
            <h1 className="text-base font-black uppercase text-slate-900 dark:text-slate-100 tracking-widest">{settings.organizationName}</h1>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 uppercase tracking-wider">
              {activeTab === 'position' && 'Statement of Financial Position'}
              {activeTab === 'activities' && 'Statement of Activities (Income Statement)'}
              {activeTab === 'functional' && 'Statement of Functional Expenses'}
              {activeTab === 'cashflow' && 'Statement of Cash Flows (Direct Method)'}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-1">
              {activeTab === 'position' 
                ? `As of ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : periodEndedLabel(endDate)
              }
            </p>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase mt-1">Figures in {settings.currencyCode} ({settings.currencySymbol})</p>
          </div>

          {/* Statement Layouts */}
          <div className="text-xs text-slate-900 dark:text-slate-100 leading-relaxed font-mono">
            {/* 1. Statement of Financial Position (Balance Sheet) */}
            {activeTab === 'position' && (
              <div className="space-y-6">
                {/* ASSETS SECTION */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Assets</h3>
                  <div className="space-y-1">
                    {positionAssetGroups.map(([group, groupAccounts]) => <React.Fragment key={group}>
                    <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group}</p>
                    {groupAccounts.map(acc => {
                      const bal = cumulativeToEndBalances[acc.code] || 0;
                      const isContra = isContraAccount(acc);
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{isContra ? `Less: ${acc.name}` : acc.name}</span>
                          <span className="font-bold">{formatCurrency(isContra ? -bal : bal)}</span>
                        </div>
                      );
                    })}
                    </React.Fragment>)}
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total Assets</span>
                    <span className="border-b-4 border-double border-slate-200 dark:border-slate-700">{formatCurrency(cumulativeToEndTotals.Assets)}</span>
                  </div>
                </div>

                {/* LIABILITIES SECTION */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Liabilities</h3>
                  <div className="space-y-1">
                    {positionLiabilityGroups.map(([group, groupAccounts]) => <React.Fragment key={group}>
                    <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group}</p>
                    {groupAccounts.map(acc => {
                      const bal = cumulativeToEndBalances[acc.code] || 0;
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{acc.name}</span>
                          <span className="font-bold">{formatCurrency(bal)}</span>
                        </div>
                      );
                    })}
                    </React.Fragment>)}
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total Liabilities</span>
                    <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(cumulativeToEndTotals.Liabilities)}</span>
                  </div>
                </div>

                {/* FUND BALANCE SECTION */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Net Assets</h3>
                  <div className="space-y-1">
                    {positionFundBalanceAccounts.map(acc => {
                      const bal = cumulativeToEndBalances[acc.code] || 0;
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{acc.name}</span>
                          <span className="font-bold">{formatCurrency(bal)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between py-1 px-4 rounded-md text-blue-900 dark:text-blue-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>{accumulatedNet.label} (Current Period)</span>
                      <span>{formatCurrency(accumulatedNet.amount)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total Fund Balance</span>
                    <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(fEndingFundBalance)}</span>
                  </div>
                </div>

                {/* LIABILITIES & FUND BALANCE GRAND TOTAL */}
                <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between font-black text-slate-900 dark:text-slate-100 text-sm px-2">
                    <span className="uppercase tracking-wider text-[10px]">Total Liabilities & Fund Balance</span>
                    <span className="border-b-4 border-double border-slate-200 dark:border-slate-700">{formatCurrency(fTotalLiabilitiesAndFund)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Statement of Activities (Income Statement) */}
            {activeTab === 'activities' && (
              <div className="space-y-6">
                {/* REVENUE */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Revenues & Contributions</h3>
                  <div className="space-y-1">
                    {activitiesRevenueAccounts.map(acc => {
                      const bal = filteredBalances[acc.code] || 0;
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{acc.name}</span>
                          <span className="font-bold">{formatCurrency(bal)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total Revenue & Inflows</span>
                    <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(filteredTotals.Revenue)}</span>
                  </div>
                </div>

                {/* Program Services is deliberately a single linked amount: its detail belongs in the Statement of Functional Expenses. */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Program-Related Expenses</h3>
                  <div className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>Program Services — see Statement of Functional Expenses</span>
                    <span className="font-bold">{formatCurrency(activitiesExpenseBreakdown.eventRelatedTotal)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total Program-Related Expenses</span>
                    <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(activitiesExpenseBreakdown.eventRelatedTotal)}</span>
                  </div>
                </div>

                {/* SUPPORTING SERVICES — journal entries without an event name */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">General & Administrative Expenses</h3>
                  <div className="space-y-1">
                    {activitiesGeneralAdminAccounts.map(acc => {
                      const bal = activitiesExpenseBreakdown.generalAdminByAccount[acc.code] || 0;
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{acc.name}</span>
                          <span className="font-bold">{formatCurrency(bal)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total General & Administrative</span>
                    <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(activitiesExpenseBreakdown.generalAdminTotal)}</span>
                  </div>
                </div>

                <div className="flex justify-between py-2 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                  <span className="uppercase text-[10px] tracking-wider">Total Expenses & Outflows</span>
                  <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(filteredTotals.Expenses)}</span>
                </div>

                {/* NET EXCESS */}
                <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between font-black text-sm px-2 text-slate-900 dark:text-slate-100">
                    <span className="uppercase tracking-wider text-[10px]">Net Surplus (Deficit) for Period</span>
                    <span className={`border-b-4 border-double border-slate-200 dark:border-slate-700 ${fNetIncome >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400 font-bold'}`}>
                      {formatCurrency(fNetIncome)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Statement of Functional Expenses */}
            {activeTab === 'functional' && (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                  Program Services are expenses posted with an event name. Supporting Services are expenses posted without an event name.
                </p>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="min-w-full text-[10px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      <tr>
                        <th className="sticky left-0 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left font-bold">Expense Category</th>
                        {activitiesExpenseBreakdown.eventNames.map(name => <th key={name} className="min-w-28 px-3 py-2 text-right font-bold">{name}</th>)}
                        <th className="min-w-28 px-3 py-2 text-right font-bold">Total Program Services</th>
                        <th className="min-w-28 px-3 py-2 text-right font-bold">Supporting Services (G&A)</th>
                        <th className="min-w-28 px-3 py-2 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {functionalExpenseAccounts.length === 0 && (
                        <tr><td colSpan={activitiesExpenseBreakdown.eventNames.length + 4} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">No expenses with a balance in this period.</td></tr>
                      )}
                      {functionalExpenseAccounts.map(account => {
                        const programAmounts = activitiesExpenseBreakdown.eventNames.map(name => activitiesExpenseBreakdown.eventGroups[name][account.code] || 0);
                        const totalPrograms = programAmounts.reduce((total, amount) => total + amount, 0);
                        const generalAdmin = activitiesExpenseBreakdown.generalAdminByAccount[account.code] || 0;
                        return (
                          <tr key={account.code} className="border-t border-slate-100 dark:border-slate-800">
                            <th className="sticky left-0 bg-white dark:bg-slate-900 px-3 py-2 text-left font-medium">{account.name}</th>
                            {programAmounts.map((amount, index) => <td key={activitiesExpenseBreakdown.eventNames[index]} className="px-3 py-2 text-right">{formatCurrency(amount)}</td>)}
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(totalPrograms)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(generalAdmin)}</td>
                            <td className="px-3 py-2 text-right font-bold">{formatCurrency(totalPrograms + generalAdmin)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold dark:border-slate-600 dark:bg-slate-800">
                      <tr>
                        <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left dark:bg-slate-800">Total Expenses</th>
                        {activitiesExpenseBreakdown.eventNames.map(name => <td key={name} className="px-3 py-2 text-right">{formatCurrency(Object.values(activitiesExpenseBreakdown.eventGroups[name]).reduce((total, amount) => total + amount, 0))}</td>)}
                        <td className="px-3 py-2 text-right">{formatCurrency(activitiesExpenseBreakdown.eventRelatedTotal)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(activitiesExpenseBreakdown.generalAdminTotal)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(filteredTotals.Expenses)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Statement of Cash Flows (Direct Method) */}
            {activeTab === 'cashflow' && (
              <div className="space-y-6">
                {/* OPERATING ACTIVITIES */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Cash Flows from Operating Activities</h3>
                  <div className="space-y-1 px-4">
                    <p className="font-semibold">Receipts from:</p>
                    {cashFlowDetails.receipts.length === 0 && <p className="pl-4 text-slate-400">No cash receipts in this period.</p>}
                    {cashFlowDetails.receipts.map(line => (
                      <div key={line.key} className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span>{line.label}</span>
                        <span>{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                    <p className="pt-2 font-semibold">Payments for:</p>
                    {cashFlowDetails.payments.length === 0 && <p className="pl-4 text-slate-400">No cash payments in this period.</p>}
                    {cashFlowDetails.payments.map(line => (
                      <div key={line.key} className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span>{line.label}</span>
                        <span>{formatOutflow(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100 mt-2 px-4">
                    <span>{netCashLabel('operating', cashFlowDetails.netOperating)}</span>
                    <span className="font-bold">{cashFlowDetails.netOperating < 0 ? formatOutflow(cashFlowDetails.netOperating) : formatCurrency(cashFlowDetails.netOperating)}</span>
                  </div>
                </div>

                {/* INVESTING ACTIVITIES */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Cash Flows from Investing Activities</h3>
                  <div className="space-y-1 px-4">
                    <div className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>{EQUIPMENT_PURCHASE_LABEL}</span>
                      <span>{formatOutflow(cashFlowDetails.equipmentPurchases)}</span>
                    </div>
                    <div className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>{FURNITURE_PURCHASE_LABEL}</span>
                      <span>{formatOutflow(cashFlowDetails.furniturePurchases)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100 mt-2 px-4">
                    <span>{netCashLabel('investing', cashFlowDetails.netInvesting)}</span>
                    <span className="font-bold">{cashFlowDetails.netInvesting < 0 ? formatOutflow(cashFlowDetails.netInvesting) : formatCurrency(cashFlowDetails.netInvesting)}</span>
                  </div>
                </div>

                {/* SUMMARY */}
                <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex justify-between font-bold px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>Net increase (decrease) in cash and cash equivalents</span>
                    <span>{cashFlowDetails.netChange < 0 ? formatOutflow(cashFlowDetails.netChange) : formatCurrency(cashFlowDetails.netChange)}</span>
                  </div>
                  <div className="flex justify-between px-2 font-medium rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>Cash and cash equivalents at beginning of year</span>
                    <span>{formatCurrency(cashFlowDetails.beginningCash)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm px-2 text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span>Cash and cash equivalents at end of year</span>
                    <span className="border-b-4 border-double border-slate-200 dark:border-slate-700">{formatCurrency(cashFlowDetails.endingCash)}</span>
                  </div>
                  {cashFlowDetails.reconcilesToLedger ? (
                    <p className="px-2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Ending cash agrees with the General Ledger cash balance of {formatCurrency(cashFlowDetails.ledgerCash)}.</p>
                  ) : (
                    <p role="alert" className="px-2 text-[10px] font-bold text-rose-700 dark:text-rose-300">Ending cash does not agree with the General Ledger cash balance of {formatCurrency(cashFlowDetails.ledgerCash)}. Check the journal entries that touch Cash on Hand.</p>
                  )}
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
