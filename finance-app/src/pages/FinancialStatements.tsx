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
import { computeActivitiesExpenseBreakdown } from '../lib/activitiesBreakdown';
import { computeAccountBalances, computeTypeTotals, isContraAccount } from '../lib/accountTotals';
import { computeTransactionReviewStates } from '../lib/reviewEngine';
import { isActivityFeeIncomplete } from '../lib/activityFees';
import { CASH_FLOW_EXPENSE_ROWS, CASH_FLOW_OPERATING_ROWS, computeCashFlowDetails } from '../lib/cashFlow';
import { excludeClosingEntries } from '../lib/closingEntries';
import { periodForSemester } from '../lib/reportingPeriod';
import { combineOpeningAndPeriodBalances } from '../lib/reportingPeriodBalances';

type ActiveStatementTab = 'position' | 'activities' | 'functional' | 'cashflow' | 'changes';

const STATEMENT_OPTIONS: { id: ActiveStatementTab; label: string }[] = [
  { id: 'position', label: 'Financial Position' },
  { id: 'activities', label: 'Activities' },
  { id: 'functional', label: 'Functional Expenses' },
  { id: 'cashflow', label: 'Cash Flows' },
  { id: 'changes', label: 'Changes in Fund Balance' },
];

export function FinancialStatements(): React.ReactElement {
  const { 
    accounts, 
    journalEntries, 
    activityFeeRecords,
    closedFiscalYears,
    formatCurrency, 
    settings,
    openingBalances,
    recordFinancialStatementHistory,
  } = useFinance();

  const [activeTab, setActiveTab] = useState<ActiveStatementTab>('position');
  const [selectedStatements, setSelectedStatements] = useState<Record<ActiveStatementTab, boolean>>({
    position: true,
    activities: true,
    functional: true,
    cashflow: true,
    changes: true,
  });
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
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
    () => computeTransactionReviewStates(journalEntries.filter(entry => !entry.isDraft), accounts, semesterKey).filter(item => item.status === 'incomplete'),
    [journalEntries, accounts, semesterKey]
  );
  const incompleteActivityFeeRecords = activityFeeRecords.filter(isActivityFeeIncomplete);
  const activeClose = closedFiscalYears.find(record => record.fiscalYear === settings.fiscalYear);
  const closingIncomplete = !activeClose?.completed;

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
    return computeTypeTotals(computeAccountBalances(priorEntries, accounts), accounts)['Fund Balance'];
  }, [journalEntries, startDate, accounts]);
  const beginningNetAssetsByRestriction = useMemo(() => {
    const priorEntries = journalEntries.filter(je => !je.isDraft && je.date < startDate);
    const balances = combineOpeningAndPeriodBalances(openingBalances, computeAccountBalances(priorEntries, accounts), accounts);
    return { unrestricted: balances['3010'] || 0, temporary: balances['3020'] || 0, permanent: balances['3030'] || 0 };
  }, [journalEntries, startDate, accounts, openingBalances]);

  const fNetIncome = filteredTotals.Revenue - filteredTotals.Expenses;
  const unclosedNetIncome = ledgerPeriodTotals.Revenue - ledgerPeriodTotals.Expenses;
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
  const negativeBalanceAccounts = useMemo(
    () => accounts.filter(account => (cumulativeToEndBalances[account.code] || 0) < -0.005),
    [accounts, cumulativeToEndBalances]
  );
  const isGated = incompleteReviewItems.length > 0 || incompleteActivityFeeRecords.length > 0 || closingIncomplete || negativeBalanceAccounts.length > 0;
  const positionAssetGroups = useMemo(() => {
    const groups: Array<[string, string[]]> = [
      ['Cash and Cash Equivalents', ['1010', '1015']], ['Receivables', ['1200', '1210', '1300', '1310', '1330', '1360', '1370']], ['Advances and Dues', ['1220', '1230', '1250', '1270', '1320']], ['Inventories', ['1700']], ['Prepaid Expenses and Other Assets', ['1260', '1280', '1285', '1295', '1298']], ['Property and Equipment', ['1500', '1550', '1600', '1650', '1660']],
    ];
    const assigned = new Set(groups.flatMap(([, codes]) => codes));
    return [...groups.map(([label, codes]) => [label, accounts.filter(account => codes.includes(account.code))] as const), ['Other Assets', accounts.filter(account => account.type === 'Assets' && !assigned.has(account.code))] as const];
  }, [accounts]);
  const positionLiabilityGroups = useMemo(() => {
    const groups: Array<[string, string[]]> = [
      ['Dues and Payables', ['2010', '2020', '2030', '2040', '2050', '2061', '2062', '2063', '2064', '2070', '2080']], ['Unearned Revenues', ['2110', '2140']], ['Refund Liabilities', ['2120', '2130', '2150']], ['Loans and Accrued Liabilities', ['2200', '2300']],
    ];
    const assigned = new Set(groups.flatMap(([, codes]) => codes));
    const grouped = groups.map(([label, codes]) => [label, accounts.filter(account => codes.includes(account.code))] as const);
    const other = accounts.filter(account => account.type === 'Liabilities' && !assigned.has(account.code));
    return other.length ? [...grouped, ['Other Liabilities', other] as const] : grouped;
  }, [accounts]);

  const activitiesRestrictionColumns = useMemo(() => {
    const temporarilyRestricted = performanceEntries
      .filter(entry => !entry.settlesEntryId)
      .flatMap(entry => entry.lines)
      .filter(line => line.accountCode === '4035')
      .reduce((sum, line) => sum + line.credit - line.debit, 0);
    const restrictionReleases = performanceEntries
      .filter(entry => Boolean(entry.settlesEntryId))
      .flatMap(entry => entry.lines)
      .filter(line => line.accountCode === '4035')
      .reduce((sum, line) => sum + line.debit - line.credit, 0);
    const permanentlyRestricted = performanceEntries
      .flatMap(entry => entry.lines)
      .filter(line => line.accountCode === '4036')
      .reduce((sum, line) => sum + line.credit - line.debit, 0);
    const totalRevenue = filteredTotals.Revenue;
    // A release debits 4035 and credits 4030.  It belongs on its own row,
    // rather than being counted once in revenue and again as a release.
    const unrestrictedRevenue = totalRevenue - temporarilyRestricted - permanentlyRestricted;
    return {
      unrestrictedRevenue,
      temporarilyRestricted,
      permanentlyRestricted,
      restrictionReleases,
      unrestrictedChange: unrestrictedRevenue - filteredTotals.Expenses,
      temporaryChange: temporarilyRestricted - restrictionReleases,
      permanentChange: permanentlyRestricted,
      beginning: beginningNetAssetsByRestriction,
    };
  }, [filteredTotals, performanceEntries, beginningNetAssetsByRestriction]);

  const saveFinalSnapshot = (action: 'Print' | 'Export PDF' | 'Export Excel') => {
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

  // Actual Export Functions
  const handleExport = (type: 'Excel' | 'PDF') => {
    setIsExporting(true);
    setExportSuccess('');

    if (type === 'PDF') {
      setTimeout(() => {
        setIsExporting(false);
        saveFinalSnapshot('Export PDF');
        window.print();
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
          const bal = cumulativeToEndBalances[acc.code] || 0;
          const isContra = isContraAccount(acc);
          csvContent += `"${isContra ? `Less: ${acc.name}` : acc.name}",${isContra ? -bal : bal}\n`;
        });
        csvContent += `"Total Assets",${cumulativeToEndTotals.Assets}\n\n`;

        csvContent += "LIABILITIES\n";
        accounts.filter(a => a.type === 'Liabilities').forEach(acc => {
          csvContent += `"${acc.name}",${cumulativeToEndBalances[acc.code] || 0}\n`;
        });
        csvContent += `"Total Liabilities",${cumulativeToEndTotals.Liabilities}\n\n`;

        csvContent += "FUND BALANCE\n";
        accounts.filter(a => a.type === 'Fund Balance').forEach(acc => {
          csvContent += `"${acc.name}",${cumulativeToEndBalances[acc.code] || 0}\n`;
        });
        csvContent += `"Accumulated Net Surplus",${unclosedNetIncome}\n`;
        csvContent += `"Total Fund Balance",${fEndingFundBalance}\n\n`;
        csvContent += `"Total Liabilities & Fund Balance",${fTotalLiabilitiesAndFund}\n`;
      } else if (activeTab === 'activities') {
        csvContent += "REVENUES\n";
        accounts.filter(a => a.type === 'Revenue').forEach(acc => {
          csvContent += `"${acc.name}",${filteredBalances[acc.code] || 0}\n`;
        });
        csvContent += `"Total Revenue",${filteredTotals.Revenue}\n\n`;
        csvContent += 'STATEMENT OF ACTIVITIES BY RESTRICTION\n';
        csvContent += 'Category,Unrestricted,Temporarily Restricted,Permanently Restricted,Total\n';
        csvContent += `"Revenues and gains",${activitiesRestrictionColumns.unrestrictedRevenue},${activitiesRestrictionColumns.temporarilyRestricted},${activitiesRestrictionColumns.permanentlyRestricted},${filteredTotals.Revenue}\n`;
        csvContent += `"Net assets released from restrictions",${activitiesRestrictionColumns.restrictionReleases},${-activitiesRestrictionColumns.restrictionReleases},0,0\n`;
        csvContent += `"Expenses and losses",${-filteredTotals.Expenses},0,0,${-filteredTotals.Expenses}\n`;
        csvContent += `"Increase (decrease) in net assets",${activitiesRestrictionColumns.unrestrictedChange},${activitiesRestrictionColumns.temporaryChange},${activitiesRestrictionColumns.permanentChange},${fNetIncome}\n`;
        csvContent += `"Net assets at beginning of year",${activitiesRestrictionColumns.beginning.unrestricted},${activitiesRestrictionColumns.beginning.temporary},${activitiesRestrictionColumns.beginning.permanent},${activitiesRestrictionColumns.beginning.unrestricted + activitiesRestrictionColumns.beginning.temporary + activitiesRestrictionColumns.beginning.permanent}\n`;
        csvContent += `"Net assets at end of year",${activitiesRestrictionColumns.beginning.unrestricted + activitiesRestrictionColumns.unrestrictedChange},${activitiesRestrictionColumns.beginning.temporary + activitiesRestrictionColumns.temporaryChange},${activitiesRestrictionColumns.beginning.permanent + activitiesRestrictionColumns.permanentChange},${activitiesRestrictionColumns.beginning.unrestricted + activitiesRestrictionColumns.unrestrictedChange + activitiesRestrictionColumns.beginning.temporary + activitiesRestrictionColumns.temporaryChange + activitiesRestrictionColumns.beginning.permanent + activitiesRestrictionColumns.permanentChange}\n\n`;

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
      } else if (activeTab === 'functional') {
        csvContent += 'FUNCTIONAL EXPENSES\n';
        csvContent += `"Expense Category",${activitiesExpenseBreakdown.eventNames.map(name => `"${name}"`).join(',')},"Total Program Services","General & Administrative","Total Expenses"\n`;
        accounts.filter(account => account.type === 'Expenses').forEach(account => {
          const programAmounts = activitiesExpenseBreakdown.eventNames.map(name => activitiesExpenseBreakdown.eventGroups[name][account.code] || 0);
          const totalPrograms = programAmounts.reduce((total, amount) => total + amount, 0);
          const generalAdmin = activitiesExpenseBreakdown.generalAdminByAccount[account.code] || 0;
          csvContent += `"${account.name}",${programAmounts.join(',')},${totalPrograms},${generalAdmin},${totalPrograms + generalAdmin}\n`;
        });
        csvContent += `"Total Expenses",${activitiesExpenseBreakdown.eventNames.map(name => Object.values(activitiesExpenseBreakdown.eventGroups[name]).reduce((total, amount) => total + amount, 0)).join(',')},${activitiesExpenseBreakdown.eventRelatedTotal},${activitiesExpenseBreakdown.generalAdminTotal},${filteredTotals.Expenses}\n`;
      } else if (activeTab === 'cashflow') {
        csvContent += "CASH FLOWS FROM OPERATING ACTIVITIES\n";
        csvContent += "Cash received from:\n";
        CASH_FLOW_OPERATING_ROWS.forEach(row => {
          csvContent += `"${row.label}",${cashFlowDetails.operatingInflows[row.key]}\n`;
        });
        csvContent += `"Other Receipts",${cashFlowDetails.otherReceipts}\n`;
        csvContent += "Cash paid for:\n";
        CASH_FLOW_EXPENSE_ROWS.forEach(row => {
          csvContent += `"${row.label}",${cashFlowDetails.operatingOutflows[row.key]}\n`;
        });
        csvContent += `"Other Expenses",${cashFlowDetails.otherExpenses}\n`;
        csvContent += `"Net Cash Provided by Operating Activities",${cashFlowDetails.netOperating}\n\n`;

        csvContent += "CASH FLOWS FROM INVESTING ACTIVITIES\n";
        csvContent += `"Sale of Equipment",${cashFlowDetails.equipmentSales}\n`;
        csvContent += `"Purchase of Equipment",${cashFlowDetails.equipmentPurchases}\n`;
        csvContent += `"Sale of Furniture and Fixtures",${cashFlowDetails.furnitureSales}\n`;
        csvContent += `"Purchase of Furniture and Fixtures",${cashFlowDetails.furniturePurchases}\n`;
        csvContent += `"Net Cash Provided by Investing Activities",${cashFlowDetails.netInvesting}\n\n`;

        csvContent += "CASH FLOWS FROM FINANCING ACTIVITIES\n";
        csvContent += `"Financing Cash Flows",${cashFlowDetails.financingCashFlows}\n`;
        csvContent += `"Net Cash Provided by Financing Activities",${cashFlowDetails.netFinancing}\n\n`;

        csvContent += `"Net Increase/(Decrease) in Cash",${cashFlowDetails.netChange}\n`;
        csvContent += `"Cash at Beginning of Period",${cashFlowDetails.beginningCash}\n`;
        csvContent += `"Cash at End of Period",${cashFlowDetails.endingCash}\n`;
      } else if (activeTab === 'changes') {
        csvContent += `"Beginning Fund Balance",${beginningFundBalance}\n`;
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
      saveFinalSnapshot('Export Excel');

      setIsExporting(false);
      setExportSuccess(`Successfully downloaded ${filename}`);
      setTimeout(() => setExportSuccess(''), 6000);
    }, 1000);
  };

  const cashFlowDetails = useMemo(
    () => computeCashFlowDetails(journalEntries.filter(entry => !entry.isDraft), accounts, startDate, endDate, openingBalances['1010'] || 0),
    [journalEntries, accounts, startDate, endDate, openingBalances]
  );
  const formatOutflow = (amount: number) => amount === 0
    ? formatCurrency(0)
    : `(${formatCurrency(Math.abs(amount))})`;

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
          <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">Custom FS set</p>
              <button
                type="button"
                onClick={() => setSelectedStatements({ position: true, activities: true, functional: true, cashflow: true, changes: true })}
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

          <button
            onClick={() => setActiveTab('changes')}
            disabled={!selectedStatements.changes}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between group ${
              !selectedStatements.changes ? 'hidden' : activeTab === 'changes' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                {negativeBalanceAccounts.length > 0
                  ? `${negativeBalanceAccounts.length} account${negativeBalanceAccounts.length === 1 ? '' : 's'} have a negative balance. Correct the previous transactions before generating financial statements.`
                  : incompleteReviewItems.length + incompleteActivityFeeRecords.length > 0
                  ? `${incompleteReviewItems.length + incompleteActivityFeeRecords.length} item${incompleteReviewItems.length + incompleteActivityFeeRecords.length === 1 ? '' : 's'} in REVIEW still need an answer before the books are final. Resolve them in Review, then come back here.`
                  : 'Complete the three required Closing Entries stages for the active fiscal year before generating financial statements.'}
              </p>
              {negativeBalanceAccounts.length > 0 && <div className="mt-4 max-w-md mx-auto space-y-2 text-left">{negativeBalanceAccounts.map(account => <div key={account.code} className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[11px] font-semibold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{account.code} {account.name}: {formatCurrency(cumulativeToEndBalances[account.code] || 0)}. Please check previous transactions; an amount may be missing.</div>)}</div>}
              {closingIncomplete && incompleteReviewItems.length === 0 && incompleteActivityFeeRecords.length === 0 && negativeBalanceAccounts.length === 0 && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Go to Closing Entries to close Revenue, Expenses, then Income Summary.</p>}
              <div className="mt-6 max-w-md mx-auto text-left space-y-2">
                {incompleteReviewItems.slice(0, 8).map(item => (
                  <div key={item.entry.id} className="flex justify-between items-center px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg text-[11px]">
                    <span className="font-semibold text-rose-900 dark:text-rose-300 truncate pr-3">{item.entry.customName || item.entry.description}</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap">Incomplete</span>
                  </div>
                ))}
                {incompleteActivityFeeRecords.slice(0, Math.max(0, 8 - incompleteReviewItems.length)).map(record => <div key={record.id} className="flex justify-between items-center px-3.5 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-lg text-[11px]"><span className="font-semibold text-rose-900 dark:text-rose-300 truncate pr-3">Activity Fees: {record.eventName}</span><span className="text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap">Incomplete</span></div>)}
                {incompleteReviewItems.length + incompleteActivityFeeRecords.length > 8 && (
                  <p className="text-[10px] text-slate-400 text-center pt-1">+{incompleteReviewItems.length + incompleteActivityFeeRecords.length - 8} more in Review</p>
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
                    {accounts.filter(a => a.type === 'Fund Balance').map(acc => {
                      const bal = cumulativeToEndBalances[acc.code] || 0;
                      return (
                        <div key={acc.code} className="flex justify-between py-1 px-4 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span>{acc.name}</span>
                          <span className="font-bold">{formatCurrency(bal)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between py-1 px-4 rounded-md text-blue-900 dark:text-blue-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Accumulated Net Surplus (Current Period)</span>
                      <span>{formatCurrency(unclosedNetIncome)}</span>
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

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="min-w-full text-[10px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200"><tr><th className="px-3 py-2 text-left font-bold">Statement of Activities by restriction</th><th className="px-3 py-2 text-right font-bold">Unrestricted</th><th className="px-3 py-2 text-right font-bold">Temporarily Restricted</th><th className="px-3 py-2 text-right font-bold">Permanently Restricted</th><th className="px-3 py-2 text-right font-bold">Total</th></tr></thead>
                    <tbody>
                      <tr className="border-t border-slate-100 dark:border-slate-800"><th className="px-3 py-2 text-left font-medium">Revenues and gains</th><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.unrestrictedRevenue)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.temporarilyRestricted)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.permanentlyRestricted)}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(filteredTotals.Revenue)}</td></tr>
                      <tr className="border-t border-slate-100 dark:border-slate-800"><th className="px-3 py-2 text-left font-medium">Net assets released from restrictions</th><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.restrictionReleases)}</td><td className="px-3 py-2 text-right">{formatCurrency(-activitiesRestrictionColumns.restrictionReleases)}</td><td className="px-3 py-2 text-right">{formatCurrency(0)}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(0)}</td></tr>
                      <tr className="border-t border-slate-100 dark:border-slate-800"><th className="px-3 py-2 text-left font-medium">Expenses and losses</th><td className="px-3 py-2 text-right">{formatCurrency(-filteredTotals.Expenses)}</td><td className="px-3 py-2 text-right">{formatCurrency(0)}</td><td className="px-3 py-2 text-right">{formatCurrency(0)}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(-filteredTotals.Expenses)}</td></tr>
                    </tbody>
                    <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold dark:border-slate-600 dark:bg-slate-800">
                      <tr><th className="px-3 py-2 text-left">Increase (decrease) in net assets</th><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.unrestrictedChange)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.temporaryChange)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.permanentChange)}</td><td className="px-3 py-2 text-right">{formatCurrency(fNetIncome)}</td></tr>
                      <tr><th className="px-3 py-2 text-left">Net assets at beginning of year</th><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.unrestricted)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.temporary)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.permanent)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.unrestricted + activitiesRestrictionColumns.beginning.temporary + activitiesRestrictionColumns.beginning.permanent)}</td></tr>
                      <tr><th className="px-3 py-2 text-left">Net assets at end of year</th><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.unrestricted + activitiesRestrictionColumns.unrestrictedChange)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.temporary + activitiesRestrictionColumns.temporaryChange)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.permanent + activitiesRestrictionColumns.permanentChange)}</td><td className="px-3 py-2 text-right">{formatCurrency(activitiesRestrictionColumns.beginning.unrestricted + activitiesRestrictionColumns.unrestrictedChange + activitiesRestrictionColumns.beginning.temporary + activitiesRestrictionColumns.temporaryChange + activitiesRestrictionColumns.beginning.permanent + activitiesRestrictionColumns.permanentChange)}</td></tr>
                    </tfoot>
                  </table>
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
                      {accounts.filter(account => account.type === 'Expenses').map(account => {
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
                    <p className="font-semibold">Cash received from:</p>
                    {CASH_FLOW_OPERATING_ROWS.map(row => (
                      <div key={row.key} className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span>{row.label}</span>
                        <span>{formatCurrency(cashFlowDetails.operatingInflows[row.key])}</span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Other Receipts</span>
                      <span>{formatCurrency(cashFlowDetails.otherReceipts)}</span>
                    </div>
                    <p className="pt-2 font-semibold">Less: Cash paid for:</p>
                    {CASH_FLOW_EXPENSE_ROWS.map(row => (
                      <div key={row.key} className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span>{row.label}</span>
                        <span>{formatOutflow(cashFlowDetails.operatingOutflows[row.key])}</span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-md pl-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Other Expenses</span>
                      <span>{formatOutflow(cashFlowDetails.otherExpenses)}</span>
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
                      <span>Sale of Equipment</span>
                      <span>{formatCurrency(cashFlowDetails.equipmentSales)}</span>
                    </div>
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Purchase of Equipment</span>
                      <span>{formatOutflow(cashFlowDetails.equipmentPurchases)}</span>
                    </div>
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Sale of Furniture and Fixtures</span>
                      <span>{formatCurrency(cashFlowDetails.furnitureSales)}</span>
                    </div>
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Purchase of Furniture and Fixtures</span>
                      <span>{formatOutflow(cashFlowDetails.furniturePurchases)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-1.5 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100 mt-2 px-4">
                    <span>Net Cash Provided by Investing Activities</span>
                    <span className="font-bold">{formatCurrency(cashFlowDetails.netInvesting)}</span>
                  </div>
                </div>

                {/* FINANCING ACTIVITIES */}
                <div>
                  <h3 className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[10px]">Cash Flows from Financing Activities</h3>
                  <div className="space-y-1 px-4">
                    <div className="flex justify-between rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span>Financing Cash Flows</span>
                      <span>{cashFlowDetails.financingCashFlows < 0 ? formatOutflow(cashFlowDetails.financingCashFlows) : formatCurrency(cashFlowDetails.financingCashFlows)}</span>
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
                    <span className="font-bold">{formatCurrency(beginningFundBalance)}</span>
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
