import React, { useState, useMemo } from 'react';
import { ClipboardCheck, CheckCircle2, AlertCircle, Undo2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { JournalEntry } from '../types';
import { ReceiptAttachments } from '../components/ReceiptAttachments';
import {
  computePendingObligations,
  computeAdvanceSettlement,
  buildAdvanceSettlementLines,
  buildSimpleSettlementLines,
  buildPrepaidExpenseSettlementLines,
  obligationAccountLabel,
  PendingObligation,
  AdvanceSettlementStatus,
  PREPAID_EXPENSE_CODE,
  computeTransactionReviewStates,
  buildRestrictionReleaseLines,
  buildDonatedInventorySettlementLines,
  DONATED_FOOD_SUPPLIES_CODE,
  DONATED_EVENT_SUPPLIES_CODE,
  ReviewStatus,
} from '../lib/reviewEngine';

const ADVANCE_STATUS_OPTIONS: { value: AdvanceSettlementStatus; label: string; needsAmount: boolean }[] = [
  { value: 'used-paid-wholly', label: 'Used, and fully covered by the advance', needsAmount: false },
  { value: 'used-not-yet-paid', label: 'Used, but not yet paid — bought on credit from a supplier', needsAmount: false },
  { value: 'not-used', label: 'Not used at all — returning the full amount', needsAmount: false },
  { value: 'used-partly-paid', label: 'Used, but only partly covered by the advance', needsAmount: true },
  { value: 'not-used-partly-paid', label: 'Only part of it was used — returning the rest', needsAmount: true },
];

function ObligationRow({
  obligation,
  onSettlementPosted,
}: {
  obligation: PendingObligation;
  onSettlementPosted: (entry: JournalEntry) => void;
}): React.ReactElement {
  const { accounts, journalEntries, formatCurrency, addJournalEntry } = useFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [rowMessage, setRowMessage] = useState('');
  const finishSettlement = (entry?: JournalEntry) => {
    setIsOpen(false);
    if (entry) onSettlementPosted(entry);
  };

  // Due to Officers / Due to Supplier: single Full/None/Partial question.
  const [simpleChoice, setSimpleChoice] = useState<'' | 'full' | 'none' | 'partial'>('');
  const [simpleAmount, setSimpleAmount] = useState('');

  // Advances to Officers: the 5-row status table.
  const [advanceStatus, setAdvanceStatus] = useState<AdvanceSettlementStatus | ''>('');
  const [advancePartial, setAdvancePartial] = useState('');
  const [expenseAccountCode, setExpenseAccountCode] = useState('');

  // Prepaid Expenses: "how much of this is now used?" + which account.
  // Defaults the expense account to whatever the original entry already
  // used (if any) — the same category almost always applies once more.
  const originalEntry = journalEntries.find(je => je.id === obligation.entryId);
  const defaultExpenseAccountCode = originalEntry?.lines.find(
    l => l.debit > 0 && accounts.find(a => a.code === l.accountCode)?.type === 'Expenses'
  )?.accountCode || '';
  const [prepaidAmount, setPrepaidAmount] = useState('');
  const [prepaidExpenseAccountCode, setPrepaidExpenseAccountCode] = useState(defaultExpenseAccountCode);

  // Donated food/supplies: the asset remains open until it is used or
  // spoiled. Those are distinct outcomes because they hit different
  // expense accounts, but one Review update can record both portions.
  const [donatedUsedAmount, setDonatedUsedAmount] = useState('');
  const [donatedSpoiledAmount, setDonatedSpoiledAmount] = useState('');

  const expenseAccounts = accounts.filter(a => a.type === 'Expenses' && a.isActive);
  const isAdvance = obligation.accountCode === '1250';
  const isPrepaid = obligation.accountCode === PREPAID_EXPENSE_CODE;
  const isDonatedFood = obligation.accountCode === DONATED_FOOD_SUPPLIES_CODE;
  const isDonatedInventory = isDonatedFood || obligation.accountCode === DONATED_EVENT_SUPPLIES_CODE;
  const donatedUsageExpenseAccountCode = isDonatedFood ? '5080' : '5160';
  const cashAccountCode = '1010';

  const handleDonatedInventorySubmit = () => {
    const usedAmount = Number(donatedUsedAmount) || 0;
    const spoiledAmount = Number(donatedSpoiledAmount) || 0;
    const total = usedAmount + spoiledAmount;
    if (usedAmount < 0 || spoiledAmount < 0 || total <= 0 || total > obligation.remainingAmount) {
      setRowMessage(`Enter used and/or spoiled amounts totaling more than zero and no more than ${formatCurrency(obligation.remainingAmount)}.`);
      return;
    }

    const lines = buildDonatedInventorySettlementLines(
      obligation.accountCode,
      donatedUsageExpenseAccountCode,
      usedAmount,
      spoiledAmount
    );
    const postedEntry = addJournalEntry(
      new Date().toISOString().slice(0, 10),
      `Usage/spoilage update for ${obligation.reference}: ${obligation.description}`,
      obligation.project,
      lines,
      obligation.eventName,
      obligation.entryId
    );
    setRowMessage('');
    setDonatedUsedAmount('');
    setDonatedSpoiledAmount('');
    finishSettlement(postedEntry);
  };

  const handlePrepaidSubmit = () => {
    const amount = Number(prepaidAmount) || 0;
    if (amount <= 0 || amount > obligation.remainingAmount) {
      setRowMessage(`Enter an amount greater than zero and no more than ${formatCurrency(obligation.remainingAmount)}.`);
      return;
    }
    if (!prepaidExpenseAccountCode) {
      setRowMessage('Select the expense account before posting.');
      return;
    }
    setRowMessage('');
    const lines = buildPrepaidExpenseSettlementLines(prepaidExpenseAccountCode, amount);
    let postedEntry: JournalEntry | undefined;
    if (lines.length > 0) {
      postedEntry = addJournalEntry(
        new Date().toISOString().slice(0, 10),
        `Settlement of ${obligation.reference}: ${obligation.description}`,
        obligation.project,
        lines,
        obligation.eventName,
        obligation.entryId
      );
    }
    setPrepaidAmount('');
    setPrepaidExpenseAccountCode(defaultExpenseAccountCode);
    finishSettlement(postedEntry);
  };

  const handleSimpleSubmit = () => {
    let amount = 0;
    if (simpleChoice === 'full') amount = obligation.remainingAmount;
    else if (simpleChoice === 'partial') amount = Number(simpleAmount) || 0;
    if (simpleChoice === 'none') {
      setRowMessage('No payment was posted. This transaction remains incomplete.');
      return;
    }
    if (amount <= 0 || amount > obligation.remainingAmount) {
      setRowMessage(`Enter an amount greater than zero and no more than ${formatCurrency(obligation.remainingAmount)}.`);
      return;
    }
    setRowMessage('');

    const lines = buildSimpleSettlementLines(obligation.accountCode, cashAccountCode, amount);
    let postedEntry: JournalEntry | undefined;
    if (lines.length > 0) {
      postedEntry = addJournalEntry(
        new Date().toISOString().slice(0, 10),
        `Settlement of ${obligation.reference}: ${obligation.description}`,
        obligation.project,
        lines,
        obligation.eventName,
        obligation.entryId
      );
    }
    setSimpleChoice('');
    setSimpleAmount('');
    finishSettlement(postedEntry);
  };

  const handleAdvanceSubmit = () => {
    if (!advanceStatus) return;
    const needsAmount = ADVANCE_STATUS_OPTIONS.find(o => o.value === advanceStatus)?.needsAmount;
    const partial = needsAmount ? Number(advancePartial) || 0 : 0;
    if (needsAmount && (partial <= 0 || partial > obligation.remainingAmount)) {
      setRowMessage(`Enter an amount greater than zero and no more than ${formatCurrency(obligation.remainingAmount)}.`);
      return;
    }
    setRowMessage('');
    const result = computeAdvanceSettlement(advanceStatus, obligation.remainingAmount, partial);

    const lines = buildAdvanceSettlementLines(
      result.expenseAmount > 0 ? (expenseAccountCode || null) : null,
      obligation.accountCode,
      cashAccountCode,
      '2010',
      obligation.remainingAmount,
      result
    );
    const postedEntry = addJournalEntry(
      new Date().toISOString().slice(0, 10),
      `Settlement of ${obligation.reference}: ${obligation.description}`,
      obligation.project,
      lines,
      obligation.eventName,
      obligation.entryId
    );
    setAdvanceStatus('');
    setAdvancePartial('');
    setExpenseAccountCode('');
    finishSettlement(postedEntry);
  };

  const advanceNeedsExpenseAccount = advanceStatus && advanceStatus !== 'not-used' &&
    computeAdvanceSettlement(advanceStatus, obligation.remainingAmount, Number(advancePartial) || 0).expenseAmount > 0;
  const advanceNeedsAmount = advanceStatus ? ADVANCE_STATUS_OPTIONS.find(o => o.value === advanceStatus)?.needsAmount : false;

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{obligation.description}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {obligation.reference} • {obligation.date} • {obligationAccountLabel(obligation.accountCode, accounts)}
            {obligation.eventName ? ` • ${obligation.eventName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Remaining</p>
            <p className="text-sm font-black text-rose-600 dark:text-rose-400">{formatCurrency(obligation.remainingAmount)}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
          >
            {isOpen ? 'Close' : 'Review'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-3">
          {rowMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{rowMessage}</div>
          )}
          {isDonatedInventory ? (
            <>
              <p className="text-[10px] text-slate-600 dark:text-slate-400">
                Record only what has happened so far. Any unused balance stays in Review for a later update.
              </p>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                How much was used or consumed?
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={obligation.remainingAmount}
                value={donatedUsedAmount}
                onChange={(e) => setDonatedUsedAmount(e.target.value)}
                placeholder={`0.00 — posts to ${isDonatedFood ? 'Meals & Refreshments' : 'Supplies Expense'}`}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold p-2.5 outline-none text-slate-900 dark:text-slate-100"
              />
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                How much was spoiled, expired, or unusable?
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={obligation.remainingAmount}
                value={donatedSpoiledAmount}
                onChange={(e) => setDonatedSpoiledAmount(e.target.value)}
                placeholder="0.00 — posts to Loss from Spoilage"
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold p-2.5 outline-none text-slate-900 dark:text-slate-100"
              />
              {(Number(donatedUsedAmount) > 0 || Number(donatedSpoiledAmount) > 0) && (
                <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                  Remaining after update: {formatCurrency(Math.max(0, obligation.remainingAmount - (Number(donatedUsedAmount) || 0) - (Number(donatedSpoiledAmount) || 0)))}
                </p>
              )}
              <button
                type="button"
                disabled={(Number(donatedUsedAmount) || 0) + (Number(donatedSpoiledAmount) || 0) <= 0}
                onClick={handleDonatedInventorySubmit}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-bold text-xs p-2.5 rounded-lg transition-colors"
              >
                Post Usage Update
              </button>
            </>
          ) : isPrepaid ? (
            <>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                How much of this is now used, consumed, or benefited from?
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={obligation.remainingAmount}
                value={prepaidAmount}
                onChange={(e) => setPrepaidAmount(e.target.value)}
                placeholder={`0.00, up to ${formatCurrency(obligation.remainingAmount)}`}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold p-2.5 outline-none text-slate-900 dark:text-slate-100"
              />

              {Number(prepaidAmount) > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">Which expense is this?</label>
                  <select
                    value={prepaidExpenseAccountCode}
                    onChange={(e) => setPrepaidExpenseAccountCode(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold p-2.5 outline-none text-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>Select an expense account…</option>
                    {expenseAccounts.map(acc => (
                      <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                disabled={!prepaidAmount || (Number(prepaidAmount) > 0 && !prepaidExpenseAccountCode)}
                onClick={handlePrepaidSubmit}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-bold text-xs p-2.5 rounded-lg transition-colors"
              >
                Post Settlement
              </button>
            </>
          ) : !isAdvance ? (
            <>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {obligation.accountCode === '2050'
                  ? "Did you reimburse this person/officer yet using the organization's funds?"
                  : 'Have you paid this amount using the organization’s funds?'}
              </label>
              <select
                value={simpleChoice}
                onChange={(e) => setSimpleChoice(e.target.value as any)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold p-2.5 outline-none text-slate-900 dark:text-slate-100"
              >
                <option value="" disabled>Select an answer…</option>
                <option value="full">Yes — paid in full ({formatCurrency(obligation.remainingAmount)})</option>
                <option value="none">No — not yet</option>
                <option value="partial">Partly — enter amount</option>
              </select>

              {simpleChoice === 'partial' && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={obligation.remainingAmount}
                  value={simpleAmount}
                  onChange={(e) => setSimpleAmount(e.target.value)}
                  placeholder={`Up to ${formatCurrency(obligation.remainingAmount)}`}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold p-2.5 outline-none text-slate-900 dark:text-slate-100"
                />
              )}

              <button
                type="button"
                disabled={!simpleChoice}
                onClick={handleSimpleSubmit}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-bold text-xs p-2.5 rounded-lg transition-colors"
              >
                Post Settlement
              </button>
            </>
          ) : (
            <>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Have the accountable officer actually used and/or paid this amount?
              </label>
              <select
                value={advanceStatus}
                onChange={(e) => setAdvanceStatus(e.target.value as AdvanceSettlementStatus)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold p-2.5 outline-none text-slate-900 dark:text-slate-100"
              >
                <option value="" disabled>Select an answer…</option>
                {ADVANCE_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {advanceNeedsAmount && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={obligation.remainingAmount}
                  value={advancePartial}
                  onChange={(e) => setAdvancePartial(e.target.value)}
                  placeholder={`Amount, up to ${formatCurrency(obligation.remainingAmount)}`}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold p-2.5 outline-none text-slate-900 dark:text-slate-100"
                />
              )}

              {advanceNeedsExpenseAccount && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">What expense was this used for?</label>
                  <select
                    value={expenseAccountCode}
                    onChange={(e) => setExpenseAccountCode(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold p-2.5 outline-none text-slate-900 dark:text-slate-100"
                  >
                    <option value="" disabled>Select an expense account…</option>
                    {expenseAccounts.map(acc => (
                      <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                disabled={!advanceStatus || (advanceNeedsAmount && !advancePartial) || (!!advanceNeedsExpenseAccount && !expenseAccountCode)}
                onClick={handleAdvanceSubmit}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-bold text-xs p-2.5 rounded-lg transition-colors"
              >
                Post Settlement
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Review(): React.ReactElement {
  const { journalEntries, accounts, reverseJournalEntry, addJournalEntry, formatCurrency } = useFinance();
  const pendingObligations = useMemo(() => computePendingObligations(journalEntries, accounts), [journalEntries, accounts]);
  const reviewStates = useMemo(() => computeTransactionReviewStates(journalEntries, accounts), [journalEntries, accounts]);
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [settlementMessage, setSettlementMessage] = useState('');
  const [lastPostedSettlement, setLastPostedSettlement] = useState<{ id: string; reference: string } | null>(null);

  const handleSettlementPosted = (entry: JournalEntry) => {
    setSettlementMessage(`Settlement posted as ${entry.reference}.`);
    setLastPostedSettlement({ id: entry.id, reference: entry.reference });
  };

  const handleUndoSettlement = () => {
    if (!lastPostedSettlement) return;
    reverseJournalEntry(lastPostedSettlement.id);
    setSettlementMessage(`${lastPostedSettlement.reference} was undone with a reversing entry.`);
    setLastPostedSettlement(null);
    setTimeout(() => setSettlementMessage(''), 5000);
  };

  const handleRestrictionRelease = (entry: JournalEntry, amount: number) => {
    const posted = addJournalEntry(
      new Date().toISOString().slice(0, 10),
      `Release from restriction for ${entry.reference}: ${entry.description}`,
      entry.project,
      buildRestrictionReleaseLines(amount),
      entry.eventName,
      entry.id
    );
    handleSettlementPosted(posted);
  };

  const visibleStates = statusFilter === 'all'
    ? reviewStates
    : reviewStates.filter(state => state.status === statusFilter);
  const incompleteCount = reviewStates.filter(state => state.status === 'incomplete').length;

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" /> REVIEW
        </h2>
        <p className="text-xs text-slate-700 dark:text-slate-400 mt-1 font-medium">
          Review every recorded transaction. Incomplete items stay red until their follow-up accounting is resolved.
        </p>
      </div>

      {settlementMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {settlementMessage}
          </span>
          {lastPostedSettlement && (
            <button
              type="button"
              onClick={handleUndoSettlement}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-white/70 px-2.5 py-1 text-[10px] font-bold transition-colors hover:bg-white dark:border-emerald-500/30 dark:bg-slate-900/40 dark:hover:bg-slate-900"
              title="Post a reversing entry for this settlement"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          )}
        </div>
      )}

      <div className={`rounded-xl border p-3.5 text-[11px] font-semibold flex items-center gap-2 ${incompleteCount > 0 ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300' : 'border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
        {incompleteCount > 0 ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        {incompleteCount > 0
          ? `${incompleteCount} transaction${incompleteCount === 1 ? '' : 's'} must be completed before Financial Statements can be finalized.`
          : 'All recorded transactions are complete and ready for Financial Statements.'}
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Transaction Review</h3>
            <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Complete follow-up work inside each red transaction. Completed transactions remain visible.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'incomplete', 'complete', 'reversed'] as const).map(filter => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold capitalize transition-colors ${statusFilter === filter ? 'bg-blue-700 text-white dark:bg-blue-600' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
              >
                {filter} {filter === 'all' ? `(${reviewStates.length})` : `(${reviewStates.filter(state => state.status === filter).length})`}
              </button>
            ))}
          </div>
        </div>

        {visibleStates.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No transactions in this status.</div>
        ) : visibleStates.map(state => {
          const amount = state.entry.lines.reduce((sum, line) => sum + line.debit, 0);
          const isIncomplete = state.status === 'incomplete';
          const entryObligations = pendingObligations.filter(obligation => obligation.reviewEntryId === state.entry.id);
          return (
            <article key={state.entry.id} className={`rounded-xl border p-4 ${isIncomplete ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10' : state.status === 'complete' ? 'border-emerald-100 bg-white dark:border-emerald-500/20 dark:bg-slate-900' : 'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900/70'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{state.entry.customName || state.entry.description}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${isIncomplete ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : state.status === 'complete' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{state.status}</span>
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {state.entry.reference} • {state.entry.date} • {state.entry.transactionType || 'Legacy transaction'} • {state.entry.eventName || state.entry.project}
                  </p>
                  {state.entry.transactionDetails?.counterpartyName && <p className="mt-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">Officer / payee: {state.entry.transactionDetails.counterpartyName}</p>}
                  {state.completedOn && <p className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Completed {state.completedOn}</p>}
                  {isIncomplete && (
                    <ul className="mt-2 space-y-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                      {state.missing.map(reason => <li key={reason}>• {reason}</li>)}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">{formatCurrency(amount)}</p>
                  {state.restrictedRemaining > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRestrictionRelease(state.entry, state.restrictedRemaining)}
                      className="rounded-lg bg-rose-700 px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500"
                    >
                      Event occurred — release {formatCurrency(state.restrictedRemaining)}
                    </button>
                  )}
                </div>
              </div>
              {entryObligations.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-rose-200 pt-4 dark:border-rose-500/20">
                  {entryObligations.map(obligation => (
                    <ObligationRow
                      key={`${obligation.entryId}-${obligation.accountCode}`}
                      obligation={obligation}
                      onSettlementPosted={handleSettlementPosted}
                    />
                  ))}
                </div>
              )}
              <ReceiptAttachments entryId={state.entry.id} allowAdd={state.status !== 'reversed'} />
            </article>
          );
        })}
      </section>
    </div>
  );
}
