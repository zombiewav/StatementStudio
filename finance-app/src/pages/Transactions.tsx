import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  Sparkles,
  ArrowRightLeft,
  Scale,
  Layers,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFinance, PurposeOption } from '../context/FinanceContext';
import { Account } from '../types';
import { FUNDING_SOURCE_OPTIONS, buildJournalLines, buildCompoundJournalLines } from '../lib/journalEngine';
import { CASH_ACCOUNT_CODES } from '../lib/cashAccounts';

const GENERAL_FUND_PROJECT = 'General Fund Operations';
// Working paper's Situation 5.1/5.2/5.3 branch: a donor-restricted
// contribution whose event hasn't happened yet this period.
const RESTRICTED_REVENUE_CODE = '4035';
const UNRESTRICTED_REVENUE_CODE = '4030';
const MEMBERSHIP_DUES_RECEIVABLE_CODE = '1300';

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
  const [selectedProject, setSelectedProject] = useState(GENERAL_FUND_PROJECT);
  const [debitCode, setDebitCode] = useState('5030'); // default Utilities
  const [creditCode, setCreditCode] = useState('1010'); // default Cash
  const [isSmartMatched, setIsSmartMatched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // "Whose money paid for it?" (Question B from the posting-engine build
  // plan). Only meaningful when the credit side is a cash account — for a
  // revenue, loan, or on-account match the money isn't coming out of the
  // org's cash at all, so this question doesn't apply and stays hidden.
  const [fundingSourceId, setFundingSourceId] = useState<string>(FUNDING_SOURCE_OPTIONS[0].id);

  // Donation/Restriction branching (working paper Situations 5.1/5.2/5.3):
  // two mandatory, chained questions, shown only for a cash contribution
  // (Dr Cash / Cr Contributions Revenue - Unrestricted). The first
  // ("restricted?") is asked whenever the question applies; the second
  // ("same period?") only branches out once the first is answered "yes" —
  // both must be answered before the transaction can post.
  const [restrictionAnswer, setRestrictionAnswer] = useState<'' | 'no' | 'yes'>('');
  const [samePeriodAnswer, setSamePeriodAnswer] = useState<'' | 'yes' | 'no'>('');

  // Membership Fees accrual completion (working paper row 3-4): a second
  // mandatory question that posts a second journal-line pair, so revenue
  // is never understated relative to what's actually still owed this
  // period. Kept as a string so "not yet answered" and "answered 0" are
  // distinguishable — both are valid, only the former blocks posting.
  const [remainingUnpaid, setRemainingUnpaid] = useState<string>('');

  // "What was it for?" (Question A). Only shown when the matched category
  // is genuinely ambiguous — see purposeOptions on the classification rule
  // in FinanceContext.tsx. Unlike the funding-source question, this does
  // not change the debit account (the keyword match already fixed that);
  // it only changes the description and whether the expense defaults to
  // Event-Related.
  const [purposeIndex, setPurposeIndex] = useState(0);

  const [classificationPreview, setClassificationPreview] = useState<{
    debitAccountCode: string;
    creditAccountCode: string;
    defaultDesc: string;
    purposeOptions?: PurposeOption[];
    requiresAccrualCompletion?: boolean;
  } | null>(null);

  // active accounts
  const activeAccounts = accounts.filter(a => a.isActive);

  // The funding-source question only makes sense while the credit side is
  // still a cash account — once it points at a revenue, loan, or accounts
  // payable account, "whose money paid for it?" no longer applies.
  const showFundingSource = CASH_ACCOUNT_CODES.includes(creditCode);

  // Only a cash contribution matched to Contributions Revenue - Unrestricted
  // can raise the restriction question — a release-from-restriction entry
  // (which also credits 4030, but debits 4035, not cash) is a different
  // transaction and must not ask it again.
  const showRestrictionQuestion = creditCode === UNRESTRICTED_REVENUE_CODE && debitCode === '1010';
  const showSamePeriodQuestion = showRestrictionQuestion && restrictionAnswer === 'yes';
  const isRestricted = showRestrictionQuestion && restrictionAnswer === 'yes' && samePeriodAnswer === 'no';
  const effectiveCreditCode = isRestricted ? RESTRICTED_REVENUE_CODE : creditCode;

  // The working paper's own accrual-completion example: Membership Fees
  // for the current school year needs a second mandatory answer (how much
  // remains unpaid) before it can post.
  const requiresAccrualCompletion = !!classificationPreview?.requiresAccrualCompletion;

  // Trigger classification suggestion on Name input change
  useEffect(() => {
    const match = suggestTransactionClassification(txName);
    if (match) {
      setDebitCode(match.debitAccountCode);
      setCreditCode(match.creditAccountCode);
      setIsSmartMatched(true);
      setClassificationPreview(match);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setRemainingUnpaid('');

      // Keep the funding-source dropdown in sync with whichever cash
      // account the matched rule assumed, so the two controls never
      // silently disagree about who's paying.
      const matchingSource = FUNDING_SOURCE_OPTIONS.find(o => o.creditAccountCode === match.creditAccountCode);
      if (matchingSource) {
        setFundingSourceId(matchingSource.id);
      }

      if (match.purposeOptions && match.purposeOptions.length > 0) {
        // Ambiguous category — default to its first purpose, same as
        // every other auto-filled field, but leave the dropdown editable.
        setPurposeIndex(0);
        setDescription(match.purposeOptions[0].description);
      } else if (!description) {
        setDescription(match.defaultDesc);
      }
    } else {
      setClassificationPreview(null);
      setIsSmartMatched(false);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setRemainingUnpaid('');
    }
  }, [txName, suggestTransactionClassification]);

  // When the funding source is changed by hand, apply it to the credit
  // account immediately — same "user override" behavior as changing the
  // Credit Account select manually.
  const handleFundingSourceChange = (id: string) => {
    setFundingSourceId(id);
    const option = FUNDING_SOURCE_OPTIONS.find(o => o.id === id);
    if (option) {
      setCreditCode(option.creditAccountCode);
      setIsSmartMatched(false);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
    }
  };

  // When the purpose is changed by hand, apply its description. It never
  // touches the debit/credit accounts — the keyword match already fixed
  // those.
  const handlePurposeChange = (index: number) => {
    setPurposeIndex(index);
    const option = classificationPreview?.purposeOptions?.[index];
    if (option) {
      setDescription(option.description);
    }
  };

  // Cash-advance sequencing check (working paper: "Caution: Please record
  // the cash advance transaction first before recording expenses paid
  // using a cash advance"). Spending more than the org currently has
  // outstanding as advances means the underlying cash-advance-given
  // transaction was never recorded — or was already fully spent — so this
  // expense would silently understate what's actually owed.
  const advancesOutstanding = accountBalances['1250'] || 0;
  const showCashAdvanceWarning = fundingSourceId === 'officer-cash-advance' && amount > advancesOutstanding;

  // Derived Account lookups
  const debitAccount = activeAccounts.find(a => a.code === debitCode);
  const creditAccount = activeAccounts.find(a => a.code === effectiveCreditCode);

  // Live balance changes
  const debitBefore = accountBalances[debitCode] || 0;
  const creditBefore = accountBalances[effectiveCreditCode] || 0;

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
    if (debitCode === effectiveCreditCode) {
      setErrorMessage('Debit and Credit accounts must be different for double-entry matching.');
      return;
    }
    if (showRestrictionQuestion && restrictionAnswer === '') {
      setErrorMessage('Please answer: did the donor impose a strict restriction that the money be used for this event only?');
      return;
    }
    if (showSamePeriodQuestion && samePeriodAnswer === '') {
      setErrorMessage('Please answer: will the event happen in the same reporting period the donation is received?');
      return;
    }
    if (requiresAccrualCompletion && remainingUnpaid.trim() === '') {
      setErrorMessage('Please enter how much remains unpaid this period (enter 0 if none).');
      return;
    }
    if (showCashAdvanceWarning) {
      setErrorMessage('Caution: please record the cash advance transaction first before recording expenses paid using a cash advance — the amount given exceeds what’s currently outstanding.');
      return;
    }

    try {
      // Post Journal Entry
      const lines = requiresAccrualCompletion
        ? buildCompoundJournalLines([
            { debitAccountCode: debitCode, creditAccountCode: effectiveCreditCode, amount },
            { debitAccountCode: MEMBERSHIP_DUES_RECEIVABLE_CODE, creditAccountCode: effectiveCreditCode, amount: Number(remainingUnpaid) || 0 },
          ])
        : buildJournalLines(debitCode, effectiveCreditCode, amount);

      const isProgramSpecific = selectedProject !== GENERAL_FUND_PROJECT;
      const je = addJournalEntry(
        date,
        description || txName,
        selectedProject,
        lines,
        isProgramSpecific ? selectedProject : undefined
      );

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
      setPurposeIndex(0);
      setRestrictionAnswer('');
      setSamePeriodAnswer('');
      setRemainingUnpaid('');

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
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Program / Project Allocation</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.name}>{proj.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Which budget this counts against — and, unless it's General Fund Operations, which program it shows under as Event-Related on the Statement of Activities.</p>
            </div>

            {classificationPreview?.purposeOptions && classificationPreview.purposeOptions.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">What Was It For?</label>
                <select
                  value={purposeIndex}
                  onChange={(e) => handlePurposeChange(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                >
                  {classificationPreview.purposeOptions.map((opt, i) => (
                    <option key={opt.label} value={i}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Determines the memo for this transaction.</p>
              </div>
            )}

            {showFundingSource && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">Whose Money Paid For This?</label>
                <select
                  value={fundingSourceId}
                  onChange={(e) => handleFundingSourceChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:ring-blue-900/10 rounded-xl text-xs font-semibold p-2.5 outline-none transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
                >
                  {FUNDING_SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 font-medium dark:text-slate-400">Determines which account this transaction is credited against.</p>
              </div>
            )}

            {showRestrictionQuestion && (
              <div className="sm:col-span-2 space-y-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <div>
                  <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">Did the donor impose a strict restriction that the money be used for this event only? <span className="text-amber-600">*required</span></label>
                  <select
                    value={restrictionAnswer}
                    onChange={(e) => { setRestrictionAnswer(e.target.value as '' | 'no' | 'yes'); setSamePeriodAnswer(''); }}
                    className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-semibold p-2.5 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                    required
                  >
                    <option value="" disabled>Select an answer…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>

                {showSamePeriodQuestion && (
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">Will the event happen in the same reporting period the donation is received? <span className="text-amber-600">*required</span></label>
                    <select
                      value={samePeriodAnswer}
                      onChange={(e) => setSamePeriodAnswer(e.target.value as '' | 'yes' | 'no')}
                      className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-semibold p-2.5 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                      required
                    >
                      <option value="" disabled>Select an answer…</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                )}

                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                  {isRestricted
                    ? 'Recorded against Contributions Revenue - Restricted. Once the event happens, post a "Release from Restriction" transaction to reclassify it as Unrestricted.'
                    : 'Recorded against Contributions Revenue - Unrestricted.'}
                </p>
              </div>
            )}

            {requiresAccrualCompletion && (
              <div className="sm:col-span-2 p-3.5 bg-amber-50 border border-amber-100 rounded-xl dark:bg-amber-500/10 dark:border-amber-500/20">
                <label className="block text-[11px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">How much remains unpaid this period? <span className="text-amber-600">*required</span></label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">{settings.currencySymbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={remainingUnpaid}
                    onChange={(e) => setRemainingUnpaid(e.target.value)}
                    placeholder="0.00 if none"
                    className="w-full bg-white border border-amber-200 text-slate-900 rounded-lg text-xs font-bold p-2.5 pl-8 outline-none dark:bg-slate-800 dark:border-amber-500/30 dark:text-slate-100"
                    required
                  />
                </div>
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium mt-1.5">Posted to Membership Dues Receivable, so full-period revenue isn't understated just because it wasn't all collected in cash.</p>
              </div>
            )}

            {showCashAdvanceWarning && (
              <div className="sm:col-span-2 p-3 bg-rose-50 border border-rose-100 text-rose-700 text-[11px] font-semibold rounded-xl dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300">
                Caution: this amount exceeds the {formatCurrency(advancesOutstanding)} currently outstanding as cash advances. Record the cash-advance-given transaction first.
              </div>
            )}

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

            <div className="sm:col-span-2 pt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Advanced: override accounts manually
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
                  setRestrictionAnswer('');
                  setSamePeriodAnswer('');
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
                  <p className="text-[9px] text-slate-500 dark:text-slate-400">Code: {effectiveCreditCode} • Normal: {creditAccount?.normalBalance}</p>
                </div>
                <span className="font-bold text-slate-100 w-12 text-right">
                  {amount > 0 ? formatCurrency(amount) : `${settings.currencySymbol}0.00`}
                </span>
              </div>

              {/* Accrual-completion: second line pair (remaining unpaid) */}
              {requiresAccrualCompletion && Number(remainingUnpaid) > 0 && (
                <>
                  <div className="flex justify-between items-center text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 rounded-xl border-t border-dashed border-amber-200 dark:border-amber-500/30 pt-3">
                    <div>
                      <p className="text-slate-900 dark:text-slate-100">Membership Dues Receivable</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400">Code: 1300 • Normal: Debit</p>
                    </div>
                    <span className="font-bold text-slate-100 w-12 text-right">{formatCurrency(Number(remainingUnpaid))}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 rounded-xl pl-6">
                    <div>
                      <p className="text-slate-900 dark:text-slate-100">{creditAccount?.name}</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400">Code: {effectiveCreditCode} • accrued portion</p>
                    </div>
                    <span className="font-bold text-slate-100 w-12 text-right">{formatCurrency(Number(remainingUnpaid))}</span>
                  </div>
                </>
              )}
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
    </div>
  );
}