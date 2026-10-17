import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { counterpartySummary } from '../lib/counterpartyBalances';
import { automaticPostingDate, isDateWithinReportingPeriod } from '../lib/reportingPeriod';
import { OfficerAdvanceSummary } from './OfficerAdvanceSummary';

const GENERAL_FUND = 'General Fund Operations';
const RETURN_TYPE = 'Return of Advances';
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800';

export function ReturnOfAdvancesEntry(): React.ReactElement {
  const { journalEntries, addJournalEntry, formatCurrency, settings } = useFinance();
  const [officer, setOfficer] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const summary = useMemo(() => counterpartySummary(journalEntries, '1250', 'Debit'), [journalEntries]);
  const withBalance = summary.filter(row => row.balance > 0);
  const remaining = withBalance.find(row => row.name === officer)?.balance || 0;
  const postingDate = date || (settings.semester && settings.reportingYear ? automaticPostingDate(settings.semester, settings.reportingYear) : '');
  const value = Number(amount) || 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!settings.semester || !settings.reportingYear) return setError('Set the organization Semester and Year before posting.');
    if (!officer) return setError('Select the accountable officer returning the advance.');
    if (value <= 0) return setError('Enter an amount greater than zero.');
    if (value > remaining + 0.005) return setError(`The amount cannot exceed ${officer}'s remaining advance of ${formatCurrency(remaining)}.`);
    if (date && !isDateWithinReportingPeriod(date, settings.semester, settings.reportingYear)) return setError('The date must be within the active reporting period.');
    try {
      addJournalEntry(postingDate, `Return of Advance - ${officer}`, GENERAL_FUND, [
        { accountCode: '1010', debit: value, credit: 0, date: postingDate },
        { accountCode: '1250', debit: 0, credit: value, date: postingDate },
      ], undefined, undefined, { transactionType: RETURN_TYPE, details: { eventRelated: false, receiptAttachmentIds: [], counterpartyName: officer } });
      setMessage(`${officer} returned ${formatCurrency(value)}.`);
      setOfficer(''); setAmount(''); setDate('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to post the return.'); }
  };

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Return of Advances</h3>
    <p className="mt-1 text-[12px] font-medium text-slate-500">Record cash an accountable officer gives back from an advance. The amount cannot be more than that officer's remaining advance.</p>
    <div className="mt-4"><OfficerAdvanceSummary rows={summary} formatCurrency={formatCurrency} /></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[12px] font-bold uppercase text-slate-600 sm:col-span-2">Accountable officer
        <select value={officer} onChange={event => setOfficer(event.target.value)} className={inputClass}>
          <option value="">{withBalance.length ? 'Select an officer…' : 'No officer has a remaining advance'}</option>
          {withBalance.map(row => <option key={row.name} value={row.name}>{row.name} — {formatCurrency(row.balance)} remaining</option>)}
        </select>
      </label>
      <label className="text-[12px] font-bold uppercase text-slate-600">Amount
        <input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} disabled={!officer} placeholder="0.00" className={inputClass} />
        {officer && <span className={`mt-1 block text-[12px] normal-case ${value > remaining + 0.005 ? 'text-rose-600' : 'text-slate-500'}`}>Up to {formatCurrency(remaining)} can be returned.</span>}
      </label>
      <label className="text-[12px] font-bold uppercase text-slate-600">Date <span className="font-medium normal-case">(optional)</span>
        <input type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} />
        <span className="mt-1 block text-[12px] normal-case text-slate-500">If blank, the system uses {postingDate || 'the reporting period date'}.</span>
      </label>
    </div>
    {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}{message && <p className="mt-3 text-xs font-semibold text-emerald-600">{message}</p>}
    <button type="submit" disabled={withBalance.length === 0} className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">Record Return</button>
  </form>;
}
