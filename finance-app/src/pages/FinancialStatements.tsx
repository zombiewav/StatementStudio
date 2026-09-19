import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  CheckCircle,
  Eye,
  ClipboardCheck
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { CASH_ACCOUNT_CODES } from '../lib/cashAccounts';
import { computeActivitiesExpenseBreakdown } from '../lib/activitiesBreakdown';
import { computeAccountBalances, computeTypeTotals, isContraAccount } from '../lib/accountTotals';
import { computePendingObligations, obligationAccountLabel } from '../lib/reviewEngine';

type ActiveStatementTab = 'position' | 'activities' | 'cashflow' | 'changes';

export function FinancialStatements(): React.ReactElement {
  const { 
    accounts, 
    journalEntries, 
    formatCurrency, 
    settings 
  } = useFinance();

  const [activeTab, setActiveTab] = useState<ActiveStatementTab>('position');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');

  // Apply Date Range Filter on Entries
  const filteredEntries = useMemo(() => {
    return journalEntries.filter(je => je.date >= startDate && je.date <= endDate);
  }, [journalEntries, startDate, endDate]);

  // Year-end gate: every REVIEW item has to be resolved before statements
  // can be generated — an unresolved item (e.g. a donation not yet
  // released, supplies not yet fully used) means part of the books is
  // still an open question, not something a finished statement should
  // paper over. Checked against ALL entries, not just the filtered range,
  // since an open item from outside the selected period can still mean
  // the period's own numbers (a receivable, a prepaid balance) aren't
  // final yet either.
  const pendingObligations = useMemo(
    () => computePendingObligations(journalEntries, accounts),
    [journalEntries, accounts]
  );
  const isGated = pendingObligations.length > 0;

  // Compute Account Balances specifically for the filtered date range
  const filteredBalances = useMemo(
    () => computeAccountBalances(filteredEntries, accounts),
    [filteredEntries, accounts]
  );

  // Compute Statements totals from filtered balances
  const filteredTotals = useMemo(
    () => computeTypeTotals(filteredBalances, accounts),
    [filteredBalances, accounts]
  );

  const fNetIncome = filteredTotals.Revenue - filteredTotals.Expenses;
  const fEndingFundBalance = filteredTotals['Fund Balance'] + fNetIncome;
  const fTotalLiabilitiesAndFund = filteredTotals.Liabilities + fEndingFundBalance;

  // Splits Operating Expenses on the Statement of Activities into
  // Event-Related (grouped by the specific event name entered on the
  // Transactions form) versus General & Administrative — see
  // computeActivitiesExpenseBreakdown for the rule.
  const activitiesExpenseBreakdown = useMemo(
    () => computeActivitiesExpenseBreakdown(filteredEntries, accounts),
    [filteredEntries, accounts]
  );

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Actual Export Functions
  const handleExport = (type: 'Excel' | 'PDF') => {
    setIsExporting(true);
    setExportSuccess('');

    if (type === 'PDF') {
      setTimeout(() => {
        setIsExporting(false);
        handlePrint();
        setExportSuccess('PDF Print dialog opened.');
        setTimeout(() => setExportSuccess(''), 6000);
      }, 500);
      return;
    }

    // Generate CSV for "Excel" export
    setTimeout(() => {
      let csvContent = "Account Name,Balance\n";

      if (activeTab === 'position') {
        csvContent += "ASSETS\n";
        accounts.filter(a => a.type === 'Assets').forEach(acc => {
          const bal = filteredBalances[acc.code] || 0;
          const isContra = isContraAccount(acc);
          csvContent += `"${isContra ? `Less: ${acc.name}` : acc.name}",${isContra ? -bal : bal}\n`;
        });
        csvContent += `"Total Assets",${filteredTotals.Assets}\n\n`;

        csvContent += "LIABILITIES\n";
        accounts.filter(a => a.type === 'Liabilities').forEach(acc => {
          csvContent += `"${acc.name}",${filteredBalances[acc.code] || 0}\n`;
        });
        csvContent += `"Total Liabilities",${filteredTotals.Liabilities}\n\n`;

        csvContent += "FUND BALANCE\n";
        accounts.filter(a => a.type === 'Fund Balance').forEach(acc => {
          csvContent += `"${acc.name}",${filteredBalances[acc.code] || 0}\n`;
        });
        csvContent += `"Accumulated Net Surplus",${fNetIncome}\n`;
        csvContent += `"Total Fund Balance",${fEndingFundBalance}\n\n`;
        csvContent += `"Total Liabilities & Fund Balance",${fTotalLiabilitiesAndFund}\n`;
      } else if (activeTab === 'activities') {
        csvContent += "REVENUES\n";
        accounts.filter(a => a.type === 'Revenue').forEach(acc => {
          csvContent += `"${acc.name}",${filteredBalances[acc.code] || 0}\n`;
        });
        csvContent += `"Total Revenue",${filteredTotals.Revenue}\n\n`;

        csvContent += "GENERAL & ADMINISTRATIVE EXPENSES\n";
        accounts.filter(a => a.type === 'Expenses').forEach(acc => {
          csvContent += `"${acc.name}",${activitiesExpenseBreakdown.generalAdminByAccount[acc.code] || 0}\n`;
        });
        csvContent += `"Total General & Administrative",${activitiesExpenseBreakdown.generalAdminTotal}\n\n`;

        if (activitiesExpenseBreakdown.eventNames.length > 0) {
          csvContent += "EVENT-RELATED EXPENSES\n";
          activitiesExpenseBreakdown.eventNames.forEach(eventName => {
            const byAccount = activitiesExpenseBreakdown.eventGroups[eventName];
            csvContent += `"${eventName}"\n`;
            Object.entries(byAccount).forEach(([code, amount]) => {
              const acc = accounts.find(a => a.code === code);
              csvContent += `"  ${acc?.name || code}",${amount}\n`;
            });
          });
          csvContent += `"Total Event-Related",${activitiesExpenseBreakdown.eventRelatedTotal}\n\n`;
        }

        csvContent += `"Total Expenses",${filteredTotals.Expenses}\n\n`;
        csvContent += `"Net Surplus/(Deficit)",${fNetIncome}\n`;
      } else if (activeTab === 'cashflow') {
        csvContent += "CASH FLOWS FROM OPERATING ACTIVITIES\n";
        csvContent += `"Cash Inflows from Operations",${cashFlowDetails.cashInflows}\n`;
        csvContent += `"Cash Outflows for Operations",${cashFlowDetails.cashOutflows}\n`;
        csvContent += `"Net Cash from Operating",${cashFlowDetails.netOperating}\n\n`;

        csvContent += "CASH FLOWS FROM INVESTING ACTIVITIES\n";
        csvContent += `"Net Cash from Investing",${cashFlowDetails.netInvesting}\n\n`;

        csvContent += "CASH FLOWS FROM FINANCING ACTIVITIES\n";
        csvContent += `"Net Cash from Financing",${cashFlowDetails.netFinancing}\n\n`;

        csvContent += `"Net Increase/(Decrease) in Cash",${cashFlowDetails.netChange}\n`;
        csvContent += `"Cash at Beginning of Period",${cashFlowDetails.beginningCash}\n`;
        csvContent += `"Cash at End of Period",${cashFlowDetails.endingCash}\n`;
      } else if (activeTab === 'changes') {
        csvContent += `"Beginning Fund Balance",${filteredTotals['Fund Balance']}\n`;
        csvContent += `"Net Surplus / (Deficit)",${fNetIncome}\n`;
        csvContent += `"Ending Fund Balance",${fEndingFundBalance}\n`;
      }

      // Trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const filename = `${settings.organizationName.replace(/[^a-z0-9]/gi, '_').toLowerCase()} - ${activeTab}.csv`;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsExporting(false);
      setExportSuccess(`Successfully downloaded ${filename}`);
      setTimeout(() => setExportSuccess(''), 6000);
    }, 1000);
  };

  // Dynamic Direct Cash Flow calculations from transaction logs
  const cashFlowDetails = useMemo(() => {
    let cashInflows = 0;
    let cashOutflows = 0;
    let cashInvesting = 0;
    let cashFinancing = 0;
    let beginningCash = 0;

    // Filtered chronologically
    const sorted = [...filteredEntries].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach((je, idx) => {
      // 1. Identify starting opening cash
      if (idx === 0 && (je.description.toLowerCase().includes('capital') || je.description.toLowerCase().includes('initial'))) {
        je.lines.forEach(l => {
          if (CASH_ACCOUNT_CODES.includes(l.accountCode)) {
            beginningCash += l.debit;
          }
        });
        return;
      }

      je.lines.forEach(line => {
        const acc = accounts.find(a => a.code === line.accountCode);
        if (!acc) return;

        // Check if Cash is affected
        const isCashDebit = CASH_ACCOUNT_CODES.includes(line.accountCode) && line.debit > 0;
        const isCashCredit = CASH_ACCOUNT_CODES.includes(line.accountCode) && line.credit > 0;

        if (isCashDebit) {
          // Cash Inflow: Determine source (Revenue or Loan or Receivables)
          const otherLines = je.lines.filter(l => !CASH_ACCOUNT_CODES.includes(l.accountCode));
          const isLoan = otherLines.some(l => l.accountCode === '2200');
          const isAR = otherLines.some(l => l.accountCode === '1200');
          
          if (isLoan) {
            cashFinancing += line.debit;
          } else if (isAR) {
            cashInflows += line.debit; // collection of operating invoice
          } else {
            cashInflows += line.debit; // Direct Cash Revenue
          }
        }

        if (isCashCredit) {
          // Cash Outflow: Determine source (Expenses, Equip, AP)
          const otherLines = je.lines.filter(l => !CASH_ACCOUNT_CODES.includes(l.accountCode));
          const isEquip = otherLines.some(l => l.accountCode === '1500');
          
          if (isEquip) {
            cashInvesting -= line.credit;
          } else {
            cashOutflows -= line.credit; // Operating Expense cash payment
          }
        }
      });
    });

    const netOperating = cashInflows + cashOutflows;
    const netInvesting = cashInvesting;
    const netFinancing = cashFinancing;
    const netChange = netOperating + netInvesting + netFinancing;
    const endingCash = beginningCash + netChange;

    return {
      cashInflows,
      cashOutflows,
      netOperating,
      netInvesting,
      netFinancing,
      netChange,
      beginningCash,
      endingCash
    };
  }, [filteredEntries, accounts]);

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      {/* Page Title & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Financial Statements</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Generate, inspect, and print official GAAP-compliant financial summaries.</p>
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

          {/* Export PDF */}
          <button
            onClick={() => handleExport('PDF')}
            disabled={isExporting || isGated}
            className="flex items-center gap-2 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            <Download className="w-3.5 h-3.5 text-orange-500" /> Export PDF
          </button>

          {/* Export Excel */}
          <button
            onClick={() => handleExport('Excel')}
            disabled={isExporting || isGated}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-blue-900/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-100" /> Export Excel
          </button>
        </div>
      </div>

      {/* Export Loader Overlay */}
      {isExporting && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-xs flex items-center justify-center z-50 print:hidden">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-xl flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-blue-900 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs font-bold text-gray-700 dark:text-slate-200">Compiling financial statements...</span>
          </div>
        </div>
      )}

      {/* Export Toast Alert */}
      {exportSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2 max-w-xl animate-bounce print:hidden">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
          <span>{exportSuccess}</span>
        </div>
      )}

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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Navigation Tabs - Left */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1.5 print:hidden">
          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider px-3 pb-1.5 border-b border-gray-50 dark:border-slate-800 mb-1.5">Statement Reports</span>
          
          <button
            onClick={() => setActiveTab('position')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              activeTab === 'position' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Financial Position</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

          <button
            onClick={() => setActiveTab('activities')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              activeTab === 'activities' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Activities</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

          <button
            onClick={() => setActiveTab('cashflow')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              activeTab === 'cashflow' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Statement of Cash Flows</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>

          <button
            onClick={() => setActiveTab('changes')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              activeTab === 'changes' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            type="button"
          >
            <span>Changes in Fund Balance</span>
            <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 transition-opacity" />
          </button>
        </div>

        {/* Report Canvas - Right */}
        <div className="lg:col-span-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 rounded-3xl shadow-sm print:shadow-none print:border-none max-w-4xl mx-auto w-full select-none">
          {isGated ? (
            <div className="text-center py-10">
              <ClipboardCheck className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Statements aren't ready yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                {pendingObligations.length} item{pendingObligations.length === 1 ? '' : 's'} in REVIEW still need{pendingObligations.length === 1 ? 's' : ''} an answer before the books are final. Resolve them in Review, then come back here.
              </p>
              <div className="mt-6 max-w-md mx-auto text-left space-y-2">
                {pendingObligations.slice(0, 8).map(ob => (
                  <div key={`${ob.entryId}-${ob.accountCode}`} className="flex justify-between items-center px-3.5 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-lg text-[11px]">
                    <span className="font-semibold text-amber-900 dark:text-amber-300 truncate pr-3">{ob.description}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold whitespace-nowrap">{obligationAccountLabel(ob.accountCode, accounts)}</span>
                  </div>
                ))}
                {pendingObligations.length > 8 && (
                  <p className="text-[10px] text-slate-400 text-center pt-1">+{pendingObligations.length - 8} more in Review</p>
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
              {activeTab === 'cashflow' && 'Statement of Cash Flows (Direct Method)'}
              {activeTab === 'changes' && 'Statement of Changes in Fund Balance'}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-1">
              {activeTab === 'position' 
                ? `As of ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : `For the Period ${new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} to ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
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
                    {accounts.filter(a => a.type === 'Assets').map(acc => {
                      const bal = filteredBalances[acc.code] || 0;
                      const isContra = isContraAccount(acc);
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{isContra ? `Less: ${acc.name}` : acc.name}</span>
                          <span className="font-bold">{formatCurrency(isContra ? -bal : bal)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                    <span className="uppercase text-[10px] tracking-wider">Total Assets</span>
                    <span className="border-b-4 border-double border-slate-200 dark:border-slate-700">{formatCurrency(filteredTotals.Assets)}</span>
                  </div>
                </div>

                {/* LIABILITIES SECTION */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Liabilities</h3>
                  <div className="space-y-1">
                    {accounts.filter(a => a.type === 'Liabilities').map(acc => {
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
                    <span className="uppercase text-[10px] tracking-wider">Total Liabilities</span>
                    <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(filteredTotals.Liabilities)}</span>
                  </div>
                </div>

                {/* FUND BALANCE SECTION */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Fund Balance / Equity</h3>
                  <div className="space-y-1">
                    {accounts.filter(a => a.type === 'Fund Balance').map(acc => {
                      const bal = filteredBalances[acc.code] || 0;
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{acc.name}</span>
                          <span className="font-bold">{formatCurrency(bal)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between py-1 px-4 rounded-md text-blue-900 dark:text-blue-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Accumulated Net Surplus (Current Period)</span>
                      <span>{formatCurrency(fNetIncome)}</span>
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
                    {accounts.filter(a => a.type === 'Revenue').map(acc => {
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

                {/* EXPENSES — split General & Administrative vs Event-Related */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">General & Administrative Expenses</h3>
                  <div className="space-y-1">
                    {accounts.filter(a => a.type === 'Expenses').map(acc => {
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

                {activitiesExpenseBreakdown.eventNames.length > 0 && (
                  <div>
                    <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Event-Related Expenses</h3>
                    <div className="space-y-3">
                      {activitiesExpenseBreakdown.eventNames.map(eventName => {
                        const byAccount = activitiesExpenseBreakdown.eventGroups[eventName];
                        const eventTotal = Object.values(byAccount).reduce((s, v) => s + v, 0);
                        return (
                          <div key={eventName} className="pl-2">
                            <div className="flex justify-between py-1 px-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              <span>{eventName}</span>
                              <span>{formatCurrency(eventTotal)}</span>
                            </div>
                            <div className="space-y-1">
                              {Object.entries(byAccount).map(([code, amount]) => {
                                const acc = accounts.find(a => a.code === code);
                                return (
                                  <div key={code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                                    <span>{acc?.name || code}</span>
                                    <span className="font-bold">{formatCurrency(amount)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 mt-2 px-2">
                      <span className="uppercase text-[10px] tracking-wider">Total Event-Related</span>
                      <span className="border-b border-slate-200 dark:border-slate-700">{formatCurrency(activitiesExpenseBreakdown.eventRelatedTotal)}</span>
                    </div>
                  </div>
                )}

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

            {/* 3. Statement of Cash Flows (Direct Method) */}
            {activeTab === 'cashflow' && (
              <div className="space-y-6">
                {/* OPERATING ACTIVITIES */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Cash Flows from Operating Activities</h3>
                  <div className="space-y-1.5 px-4">
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Cash Collected from Operations & Clients</span>
                      <span>{formatCurrency(cashFlowDetails.cashInflows)}</span>
                    </div>
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Cash Paid to Employees & Vendors</span>
                      <span>({formatCurrency(Math.abs(cashFlowDetails.cashOutflows))})</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100 mt-2 px-4">
                    <span>Net Cash Provided by Operating Activities</span>
                    <span className="font-bold">{formatCurrency(cashFlowDetails.netOperating)}</span>
                  </div>
                </div>

                {/* INVESTING ACTIVITIES */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Cash Flows from Investing Activities</h3>
                  <div className="space-y-1 px-4">
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Purchase of Equipment & Hardware</span>
                      <span>{cashFlowDetails.netInvesting !== 0 ? `(${formatCurrency(Math.abs(cashFlowDetails.netInvesting))})` : `${settings.currencySymbol}0.00`}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100 mt-2 px-4">
                    <span>Net Cash Used in Investing Activities</span>
                    <span className="font-bold">{formatCurrency(cashFlowDetails.netInvesting)}</span>
                  </div>
                </div>

                {/* FINANCING ACTIVITIES */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Cash Flows from Financing Activities</h3>
                  <div className="space-y-1 px-4">
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Proceeds from Bank Borrowings & Loans</span>
                      <span>{formatCurrency(cashFlowDetails.netFinancing)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100 mt-2 px-4">
                    <span>Net Cash Provided by Financing Activities</span>
                    <span className="font-bold">{formatCurrency(cashFlowDetails.netFinancing)}</span>
                  </div>
                </div>

                {/* SUMMARY */}
                <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex justify-between font-bold px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>Net Increase (Decrease) in Cash</span>
                    <span>{formatCurrency(cashFlowDetails.netChange)}</span>
                  </div>
                  <div className="flex justify-between px-2 font-medium rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>Cash & Equivalents, Beginning of Period</span>
                    <span>{formatCurrency(cashFlowDetails.beginningCash)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm px-2 text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="uppercase tracking-wider text-[10px]">Cash & Equivalents, End of Period</span>
                    <span className="border-b-4 border-double border-slate-200 dark:border-slate-700">{formatCurrency(cashFlowDetails.endingCash)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Statement of Changes in Fund Balance */}
            {activeTab === 'changes' && (
              <div className="space-y-6">
                <div className="space-y-3 px-4">
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>General Unrestricted Fund, Starting Balance</span>
                    <span className="font-bold">{formatCurrency(filteredTotals['Fund Balance'])}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span>Add: Net Surplus (Deficit) for the period</span>
                    <span className={`font-semibold ${fNetIncome >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(fNetIncome)}</span>
                  </div>
                </div>

                <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between font-black text-sm px-2 text-slate-900 dark:text-slate-100">
                    <span className="uppercase tracking-wider text-[10px]">Fund Balance, End of Period</span>
                    <span className="border-b-4 border-double border-slate-200 dark:border-slate-700">{formatCurrency(fEndingFundBalance)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Signatures placeholder */}
          <div className="mt-16 pt-8 border-t border-dashed border-slate-200 dark:border-slate-700 grid grid-cols-2 text-center text-[10px] text-slate-500 dark:text-slate-400 font-sans font-bold">
            <div>
              <p className="border-b border-slate-200 dark:border-slate-700 mx-auto w-32 pb-1.5 mb-1"></p>
              <p className="uppercase text-slate-900 dark:text-slate-100">Prepared By</p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">Finance Controller / Accountant</p>
            </div>
            <div>
              <p className="border-b border-slate-200 dark:border-slate-700 mx-auto w-32 pb-1.5 mb-1"></p>
              <p className="uppercase text-slate-900 dark:text-slate-100">Approved By</p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">Chief Executive / Auditor</p>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
