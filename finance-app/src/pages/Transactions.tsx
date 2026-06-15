import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Sparkles, 
  ArrowRightLeft, 
  Scale, 
  Layers, 
  TrendingDown, 
  TrendingUp,
  ClipboardList
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFinance } from '../context/FinanceContext';
import { Account } from '../types';

// --- Program -> Expense -> Journal Entry workflow option sets -----------------
// These lists are presentation-only for now. No accounting rules, debit/credit
// mappings, or posting logic are attached to them yet. They exist so the form
// can capture Program + Expense Type classification ahead of time, ready for
// when the accounting rules for this workflow are defined.
const PROGRAM_OPTIONS = [
  'Student Development Program',
  'Community Outreach Program',
  'Faculty Development Program',
  'Research Program',
  'Extension Program',
] as const;

const EXPENSE_TYPE_OPTIONS = [
  'Office Supplies',
  'Utilities',
  'Training Expense',
  'Travel Expense',
  'Equipment Expense',
  'Maintenance Expense',
  'Miscellaneous Expense',
] as const;

// Lightweight record that bundles the Program/Expense Type classification
// together with the posted transaction's identifying details. This is
// groundwork for the future Program -> Expense -> Journal Entry workflow.
// It is purely descriptive metadata and does NOT feed into any ledger,
// trial balance, or financial statement calculation.
interface ProgramExpenseWorkflowRecord {
  reference: string;
  transactionName: string;
  program: string;
  expenseType: string;
  amount: number;
  date: string;
  description: string;
  status: 'Ready for Journal Posting';
}

export function Transactions(): React.ReactElement {
  const { 
    accounts, 
    projects, 
    addJournalEntry, 
    suggestTransactionClassification, 
    accountBalances,
    formatCurrency,
    settings
  } = useFinance();

  // Form State
  const [txName, setTxName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedProject, setSelectedProject] = useState('General Fund Operations');
  const [debitCode, setDebitCode] = useState('5030'); // default Utilities
  const [creditCode, setCreditCode] = useState('1010'); // default Cash
  const [isSmartMatched, setIsSmartMatched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Program / Expense Type workflow fields (workflow preparation only —
  // no accounting calculations are derived from these yet)
  const [program, setProgram] = useState<string>(PROGRAM_OPTIONS[0]);
  const [expenseType, setExpenseType] = useState<string>(EXPENSE_TYPE_OPTIONS[0]);
  const [lastWorkflowRecord, setLastWorkflowRecord] = useState<ProgramExpenseWorkflowRecord | null>(null);
  const [classificationPreview, setClassificationPreview] = useState<{
    expenseType: string;
    suggestedProgram: string;
    debitAccountCode: string;
    creditAccountCode: string;
    defaultDesc: string;
  } | null>(null);

  // active accounts
  const activeAccounts = accounts.filter(a => a.isActive);

  // Trigger classification suggestion on Name input change
  useEffect(() => {
    const match = suggestTransactionClassification(txName);
    if (match) {
      setDebitCode(match.debitAccountCode);
      setCreditCode(match.creditAccountCode);
      setIsSmartMatched(true);
      setClassificationPreview(match);

      if ('suggestedProgram' in match) {
        setProgram(match.suggestedProgram);
      }

      if ('expenseType' in match) {
        setExpenseType(match.expenseType);
      }

      if (!description) {
        setDescription(match.defaultDesc);
      }
    } else {
      setClassificationPreview(null);
      setIsSmartMatched(false);
    }
  }, [txName, suggestTransactionClassification]);

  // Derived Account lookups
  const debitAccount = activeAccounts.find(a => a.code === debitCode);
  const creditAccount = activeAccounts.find(a => a.code === creditCode);

  // Live balance changes
  const debitBefore = accountBalances[debitCode] || 0;
  const creditBefore = accountBalances[creditCode] || 0;

  // Normal balance calculations
  const calculateNextBalance = (acc: Account | undefined, currentBal: number, delta: number, action: 'debit' | 'credit') => {
    if (!acc) return currentBal;
    const isDebitAccount = acc.normalBalance === 'Debit';
    
    if (action === 'debit') {
      return isDebitAccount ? currentBal + delta : currentBal - delta;
    } else {
      return isDebitAccount ? currentBal - delta : currentBal + delta;
    }
  };

  const debitAfter = calculateNextBalance(debitAccount, debitBefore, amount, 'debit');
  const creditAfter = calculateNextBalance(creditAccount, creditBefore, amount, 'credit');

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!txName.trim()) {
      setErrorMessage('Please enter a transaction name.');
      return;
    }
    if (amount <= 0) {
      setErrorMessage('Please enter a valid amount greater than zero.');
      return;
    }
    if (debitCode === creditCode) {
      setErrorMessage('Debit and Credit accounts must be different for double-entry matching.');
      return;
    }

    try {
      // Post Journal Entry
      const lines = [
        { accountCode: debitCode, debit: amount, credit: 0 },
        { accountCode: creditCode, debit: 0, credit: amount }
      ];
      
      const je = addJournalEntry(
        date, 
        description || txName, 
        selectedProject, 
        lines
      );

      // Capture the Program / Expense Type classification alongside this
      // transaction for the upcoming Program -> Expense -> Journal Entry
      // workflow. This is additive metadata only — it does not alter the
      // journal entry, ledger, trial balance, or statement calculations
      // performed above.
      setLastWorkflowRecord({
        reference: je.reference,
        transactionName: txName,
        program,
        expenseType,
        amount,
        date,
        description: description || txName,
        status: 'Ready for Journal Posting',
      });

      // Trigger Confetti micro-animation!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1e3a8a', '#3b82f6', '#10b981', '#f59e0b']
      });

      // Clear Form & Alert
      setSuccessMessage(`Successfully posted ${je.reference}!`);
      setTxName('');
      setDescription('');
      setAmount(0);
      setIsSmartMatched(false);
      
      // Auto-hide success
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while posting transaction.');
    }
  };

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Smart Transaction Entry</h2>
        <p className="text-xs text-slate-700 dark:text-slate-400 mt-1 font-medium">Auto-classify transaction fields instantly using our rule-based accounting engine.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Column: Entry Form */}
        <form onSubmit={handlePost} className="xl:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-200" /> New Transaction
            </h3>
            {isSmartMatched && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-900 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full animate-pulse dark:text-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20">
                <Sparkles className="w-3.5 h-3.5" /> Rule Suggestion Match
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              {successMessage}
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Transaction Name</label>
              <input
                type="text"
                value={txName}
                onChange={(e) => setTxName(e.target.value)}
                placeholder="e.g. Electric Bill Payment, Laptop Purchase, Consulting Fee..."
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-3 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Try typing: <span className="font-semibold text-slate-600 underline dark:text-slate-300">electric</span>, <span className="font-semibold text-slate-600 underline dark:text-slate-300">laptop</span>, or <span className="font-semibold text-slate-600 underline dark:text-slate-300">donation</span> to see the rule suggestion match.</p>

              {isSmartMatched && (
                <div className="mt-2 text-xs font-semibold text-emerald-600">
                  Auto-classification applied successfully.
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Activity / Program</label>
              <select
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              >
                {PROGRAM_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Expense Category</label>
              <select
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              >
                {EXPENSE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-400">{settings.currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-bold p-2.5 pl-8 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                  required
                />
              </div>
              {/* Remove accidental duplicate light-only amount control (was causing permanent light/dark mismatch) */}
              <div className="hidden" />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Memo / Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional bookkeeping notes..."
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-medium p-3 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Debit Account (Increase Assets/Expenses)</label>
              <select
                value={debitCode}
                onChange={(e) => {
                  setDebitCode(e.target.value);
                  setIsSmartMatched(false);
                }}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              >
                {activeAccounts.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Credit Account (Increase Liabilities/Revenue)</label>
              <select
                value={creditCode}
                onChange={(e) => {
                  setCreditCode(e.target.value);
                  setIsSmartMatched(false);
                }}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              >
                {activeAccounts.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.code} - {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>

          </div>

          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-xs p-3.5 rounded-xl transition-all shadow-md shadow-blue-900/10 cursor-pointer text-center mt-2 flex items-center justify-center gap-2"
          >
            <ArrowRightLeft className="w-4 h-4" /> Post Double-Entry Transaction
          </button>
        </form>

        {/* Right Column: Live Financial Preview */}
        <div className="xl:col-span-5 space-y-6">
          {/* 1. Double Entry Preview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">Journal Entry Preview</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 px-2">
                <span>Account & Details</span>
                <div className="flex gap-12 w-28 justify-between">
                  <span>Debit</span>
                  <span>Credit</span>
                </div>
              </div>

              {/* Journal Line: Debit */}
              <div className="flex justify-between items-center text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 rounded-xl">
                <div>
                  <p className="text-slate-900 dark:text-slate-100">{debitAccount?.name || 'Debit Account'}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Code: {debitCode} • Normal: {debitAccount?.normalBalance}</p>
                </div>
                <span className="font-bold text-slate-100 w-12 text-right">
                  {amount > 0 ? formatCurrency(amount) : `${settings.currencySymbol}0.00`}
                </span>
              </div>

              {/* Journal Line: Credit */}
              <div className="flex justify-between items-center text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 rounded-xl pl-6">
                <div>
                  <p className="text-slate-900 dark:text-slate-100">{creditAccount?.name || 'Credit Account'}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Code: {creditCode} • Normal: {creditAccount?.normalBalance}</p>
                </div>
                <span className="font-bold text-slate-100 w-12 text-right">
                  {amount > 0 ? formatCurrency(amount) : `${settings.currencySymbol}0.00`}
                </span>
              </div>
            </div>
            
            <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[10px] text-emerald-700 font-semibold flex justify-between items-center dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400">
              <span>Equation Status</span>
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Scale className="w-3.5 h-3.5" /> Balanced Dr = Cr
              </span>
            </div>
          </div>

          {/* 2. Ledger Impact preview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">Projected Ledger Impact</h3>

            <div className="space-y-3.5">
              {/* Debit account projection */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{debitAccount?.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Debit Posting (+)</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-semibold line-through">{formatCurrency(debitBefore)}</p>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(debitAfter)}</p>
                </div>
              </div>

              {/* Credit account projection */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{creditAccount?.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Credit Posting (-)</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-semibold line-through">{formatCurrency(creditBefore)}</p>
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{formatCurrency(creditAfter)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Statement Impact */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">Statement Impact Preview</h3>
            
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 dark:text-slate-400">Balance Sheet Impact</span>
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center justify-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> 
                  {debitAccount?.type === 'Assets' || creditAccount?.type === 'Assets' 
                    ? `Assets Change: ${formatCurrency((debitAccount?.type === 'Assets' ? amount : 0) - (creditAccount?.type === 'Assets' ? amount : 0))}` 
                    : 'No direct Asset impact'}
                </span>
              </div>
              <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 dark:text-slate-400">Income Statement Impact</span>
                <span className={`text-xs font-bold flex items-center justify-center gap-1 ${
                  debitAccount?.type === 'Expenses' ? 'text-rose-600 dark:text-rose-400' : debitAccount?.type === 'Revenue' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {debitAccount?.type === 'Expenses' 
                    ? <TrendingDown className="w-3.5 h-3.5" /> 
                    : <TrendingUp className="w-3.5 h-3.5" />}
                  {debitAccount?.type === 'Expenses' 
                    ? `Net Income: -${formatCurrency(amount)}` 
                    : creditAccount?.type === 'Revenue' 
                      ? `Net Income: +${formatCurrency(amount)}` 
                      : 'No net income change'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Program -> Expense -> Journal Entry Workflow Preview (below the form) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-700 dark:text-blue-400" /> Journal Entry Preview
          </h3>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Program &rarr; Expense &rarr; Journal Entry Workflow
          </span>
        </div>

        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
          This is only a preview. No journal entry is created from this section — it reflects the Program and
          Expense Type that will be attached to the transaction once posted.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Program</span>
            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{program}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Expense Type</span>
            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{expenseType}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Amount</span>
            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
              {amount > 0 ? formatCurrency(amount) : `${settings.currencySymbol}0.00`}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
            <span className="block text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">Status</span>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" /> Ready for Journal Posting
            </span>
          </div>
        </div>

        {lastWorkflowRecord && (
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium pt-1">
            Last posted transaction <span className="font-semibold text-slate-700 dark:text-slate-300">{lastWorkflowRecord.reference}</span> ("{lastWorkflowRecord.transactionName}")
            was tagged with <span className="font-semibold text-slate-700 dark:text-slate-300">{lastWorkflowRecord.program}</span> /{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{lastWorkflowRecord.expenseType}</span> for {formatCurrency(lastWorkflowRecord.amount)}.
          </div>
        )}
      </div>
    </div>
  );
}