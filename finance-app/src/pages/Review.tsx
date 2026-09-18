import React, { useState, useMemo } from 'react';
import { ClipboardCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import {
  computePendingObligations,
  computeAdvanceSettlement,
  buildAdvanceSettlementLines,
  buildSimpleSettlementLines,
  obligationAccountLabel,
  PendingObligation,
  AdvanceSettlementStatus,
} from '../lib/reviewEngine';

const ADVANCE_STATUS_OPTIONS: { value: AdvanceSettlementStatus; label: string; needsAmount: boolean }[] = [
  { value: 'used-paid-wholly', label: 'Used, and fully covered by the advance', needsAmount: false },
  { value: 'used-not-yet-paid', label: 'Used, but not yet paid — bought on credit from a supplier', needsAmount: false },
  { value: 'not-used', label: 'Not used at all — returning the full amount', needsAmount: false },
  { value: 'used-partly-paid', label: 'Used, but only partly covered by the advance', needsAmount: true },
  { value: 'not-used-partly-paid', label: 'Only part of it was used — returning the rest', needsAmount: true },
];

function ObligationRow({ obligation }: { obligation: PendingObligation }): React.ReactElement {
  const { accounts, formatCurrency, addJournalEntry } = useFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [settled, setSettled] = useState(false);

  // Due to Officers / Due to Supplier: single Full/None/Partial question.
  const [simpleChoice, setSimpleChoice] = useState<'' | 'full' | 'none' | 'partial'>('');
  const [simpleAmount, setSimpleAmount] = useState('');

  // Advances to Officers: the 5-row status table.
  const [advanceStatus, setAdvanceStatus] = useState<AdvanceSettlementStatus | ''>('');
  const [advancePartial, setAdvancePartial] = useState('');
  const [expenseAccountCode, setExpenseAccountCode] = useState('');

  const expenseAccounts = accounts.filter(a => a.type === 'Expenses' && a.isActive);
  const isAdvance = obligation.accountCode === '1250';
  const cashAccountCode = '1010';

  const handleSimpleSubmit = () => {
    let amount = 0;
    if (simpleChoice === 'full') amount = obligation.remainingAmount;
    else if (simpleChoice === 'partial') amount = Number(simpleAmount) || 0;
    // 'none' stays 0 — nothing to post, obligation stays open.

    const lines = buildSimpleSettlementLines(obligation.accountCode, cashAccountCode, amount);
    if (lines.length > 0) {
      addJournalEntry(
        new Date().toISOString().slice(0, 10),
        `Settlement of ${obligation.reference}: ${obligation.description}`,
        obligation.project,
        lines,
        obligation.eventName,
        obligation.entryId
      );
    }
    setSettled(true);
  };

  const handleAdvanceSubmit = () => {
    if (!advanceStatus) return;
    const needsAmount = ADVANCE_STATUS_OPTIONS.find(o => o.value === advanceStatus)?.needsAmount;
    const partial = needsAmount ? Number(advancePartial) || 0 : 0;
    const result = computeAdvanceSettlement(advanceStatus, obligation.remainingAmount, partial);

    const lines = buildAdvanceSettlementLines(
      result.expenseAmount > 0 ? (expenseAccountCode || null) : null,
      obligation.accountCode,
      cashAccountCode,
      '2010',
      obligation.remainingAmount,
      result
    );
    addJournalEntry(
      new Date().toISOString().slice(0, 10),
      `Settlement of ${obligation.reference}: ${obligation.description}`,
      obligation.project,
      lines,
      obligation.eventName,
      obligation.entryId
    );
    setSettled(true);
  };

  const advanceNeedsExpenseAccount = advanceStatus && advanceStatus !== 'not-used' &&
    computeAdvanceSettlement(advanceStatus, obligation.remainingAmount, Number(advancePartial) || 0).expenseAmount > 0;
  const advanceNeedsAmount = advanceStatus ? ADVANCE_STATUS_OPTIONS.find(o => o.value === advanceStatus)?.needsAmount : false;

  if (settled) {
    return (
      <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
        <CheckCircle2 className="w-4 h-4 shrink-0" /> Settlement posted for {obligation.reference}.
      </div>
    );
  }

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
            <p className="text-sm font-black text-amber-600 dark:text-amber-400">{formatCurrency(obligation.remainingAmount)}</p>
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
          {!isAdvance ? (
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
  const { journalEntries, accounts } = useFinance();
  const pendingObligations = useMemo(() => computePendingObligations(journalEntries, accounts), [journalEntries, accounts]);

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" /> REVIEW
        </h2>
        <p className="text-xs text-slate-700 dark:text-slate-400 mt-1 font-medium">
          Follow up on open balances — Due to Officers, Due to Supplier, and Advances to Officers — until each one is settled.
        </p>
      </div>

      {pendingObligations.length === 0 ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Nothing pending review.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Every reimbursement, supplier bill, and cash advance is settled.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl flex items-center gap-2 text-[11px] font-semibold text-blue-800 dark:text-blue-300">
            <AlertCircle className="w-4 h-4 shrink-0" /> {pendingObligations.length} item{pendingObligations.length === 1 ? '' : 's'} waiting on a follow-up answer.
          </div>
          {pendingObligations.map(ob => (
            <ObligationRow key={`${ob.entryId}-${ob.accountCode}`} obligation={ob} />
          ))}
        </div>
      )}
    </div>
  );
}
