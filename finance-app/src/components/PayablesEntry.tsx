import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { counterpartyBalance, counterpartyBalances } from '../lib/counterpartyBalances';
import { buildPriorPeriodPayablePayment, PayablePaymentMethod, PRIOR_PERIOD_PAYABLE_CHOICES, PRIOR_PERIOD_PAYABLE_CODES, PriorPeriodPayableCode, outstandingPayableBalance } from '../lib/payablePayments';
import { reportingPeriodBounds } from '../lib/reportingPeriod';

const GENERAL_FUND = 'General Fund Operations';
const methods: { value: PayablePaymentMethod; label: string }[] = [
  { value: 'organization-funds', label: 'Paid directly by the organization' },
  { value: 'officer-personal', label: 'Paid by an officer using personal money - to be reimbursed' },
  { value: 'officer-advance', label: 'Paid using a cash advance previously given to the officer' },
  { value: 'combination', label: 'Combination of organization funds, officer personal money, and/or cash advance' },
];

const amount = (value: string) => Number(value) || 0;
const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const allowedPayableCodes: readonly PriorPeriodPayableCode[] = PRIOR_PERIOD_PAYABLE_CODES;

export function PayablesEntry(): React.ReactElement {
  const { accounts, journalEntries, addJournalEntry, accountBalances, formatCurrency, settings } = useFinance();
  const [payableCode, setPayableCode] = useState<PriorPeriodPayableCode | ''>('');
  const [method, setMethod] = useState<PayablePaymentMethod>('organization-funds');
  const [paymentDate, setPaymentDate] = useState('');
  const [organizationAmount, setOrganizationAmount] = useState('');
  const [officerAmount, setOfficerAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [officer, setOfficer] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Every choice on the client's sheet is listed; only those with an outstanding
  // balance left can be selected.
  const payableChoices = useMemo(() => PRIOR_PERIOD_PAYABLE_CHOICES.filter(choice => allowedPayableCodes.includes(choice.code)).map(choice => ({
    ...choice,
    name: accounts.find(account => account.code === choice.code)?.name || choice.code,
    remaining: outstandingPayableBalance(accountBalances, choice.code),
  })), [accounts, allowedPayableCodes, accountBalances]);
  const payableOptions = payableChoices.filter(option => option.remaining > 0);
  const selected = payableOptions.find(option => option.code === payableCode);
  const officerAdvances = useMemo(() => counterpartyBalances(journalEntries, '1250', 'Debit'), [journalEntries]);
  const availableAdvance = officer ? counterpartyBalance(journalEntries, '1250', 'Debit', officer) : 0;
  const availableCash = Math.max(0, accountBalances['1010'] || 0);
  const showOrganization = method === 'organization-funds' || method === 'combination';
  const showOfficer = method === 'officer-personal' || method === 'combination';
  const showAdvance = method === 'officer-advance' || method === 'combination';
  const paymentTotal = (showOrganization ? amount(organizationAmount) : 0) + (showOfficer ? amount(officerAmount) : 0) + (showAdvance ? amount(advanceAmount) : 0);
  const automaticPostingDate = useMemo(() => {
    const today = localToday();
    if (!settings.semester || !settings.reportingYear) return today;
    const bounds = reportingPeriodBounds(settings.semester, settings.reportingYear);
    return today >= bounds.startDate && today <= bounds.endDate ? today : bounds.endDate;
  }, [settings.reportingYear, settings.semester]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!settings.semester || !settings.reportingYear) return setError('Set the organization Semester and Year before posting.');
    if (!payableCode || !selected) return setError('Select a payable that still has an outstanding balance.');
    if ((showOfficer || showAdvance) && !officer.trim()) return setError('Select or enter the accountable officer.');
    try {
      const transactionDate = paymentDate || automaticPostingDate;
      const posting = buildPriorPeriodPayablePayment({ payableAccountCode: payableCode, paymentMethod: method, transactionDate, paymentDate, organizationAmount: amount(organizationAmount), officerAmount: amount(officerAmount), advanceAmount: amount(advanceAmount), outstandingBalance: selected.remaining, availableCash, availableAdvance });
      addJournalEntry(transactionDate, `Payment of Previous-Period ${selected.name}`, GENERAL_FUND, posting.lines, undefined, undefined, {
        transactionType: 'Payment of Previous-Period Payables',
        details: { eventRelated: false, receiptAttachmentIds: [], priorPeriodPayableAccountCode: payableCode, priorPeriodPayablePaymentAmount: posting.total, priorPeriodPayablePaymentMethod: method, counterpartyName: officer.trim() || selected.name },
      });
      setMessage('Payable payment posted successfully.');
      setPayableCode(''); setPaymentDate(''); setOrganizationAmount(''); setOfficerAmount(''); setAdvanceAmount(''); setOfficer('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to post the payable payment.'); }
  };

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Payment of Accounts Payable</h3>
    <p className="mt-1 text-[10px] font-medium text-slate-500">Payment is limited to the outstanding (remaining) balance of the selected Accounts Payable account.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Payable to pay<select value={payableCode} onChange={event => setPayableCode(event.target.value as PriorPeriodPayableCode)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="">Select a payable…</option>{payableChoices.map(option => <option key={option.code} value={option.code} disabled={option.remaining <= 0}>{option.label} — {option.remaining > 0 ? `${formatCurrency(option.remaining)} remaining` : 'no outstanding balance'}</option>)}</select>{selected && <span className="mt-1 block text-[10px] normal-case text-slate-500">Related payable account: {selected.name}</span>}</label>
      {payableOptions.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 sm:col-span-2">None of these payables has an outstanding balance. The choices stay greyed out until a payable is recorded or carried forward.</p>}
      <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Date optional<input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><span className="mt-1 block text-[10px] normal-case text-slate-500">If blank, the system uses {automaticPostingDate}.</span></label>
      <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Payment method<select value={method} onChange={event => setMethod(event.target.value as PayablePaymentMethod)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">{methods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {(showOfficer || showAdvance) && <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Accountable officer<input list="payable-officers" value={officer} onChange={event => setOfficer(event.target.value)} placeholder="Officer name" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><datalist id="payable-officers">{officerAdvances.map(record => <option key={record.name} value={record.name} />)}</datalist>{showAdvance && <span className="mt-1 block text-[10px] text-indigo-700">Available advance for this officer: {formatCurrency(availableAdvance)}</span>}</label>}
      {showOrganization && <label className="text-[10px] font-bold uppercase text-slate-600">Organization cash payment<input type="number" min="0" step="0.01" value={organizationAmount} onChange={event => setOrganizationAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><span className="mt-1 block text-[10px] normal-case text-slate-500">Available cash: {formatCurrency(availableCash)}</span></label>}
      {showOfficer && <label className="text-[10px] font-bold uppercase text-slate-600">Officer personal payment<input type="number" min="0" step="0.01" value={officerAmount} onChange={event => setOfficerAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><span className="mt-1 block text-[10px] normal-case text-slate-500">Reimburse the officer separately under Reimbursement to Officers.</span></label>}
      {showAdvance && <label className="text-[10px] font-bold uppercase text-slate-600">Officer advance payment<input type="number" min="0" step="0.01" value={advanceAmount} onChange={event => setAdvanceAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>}
      <div className="rounded-lg bg-slate-50 p-3 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 sm:col-span-2">Total payment: {formatCurrency(paymentTotal)}{selected && <span className="ml-2">Maximum outstanding balance: {formatCurrency(selected.remaining)}</span>}</div>
    </div>
    {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}{message && <p className="mt-3 text-xs font-semibold text-emerald-600">{message}</p>}
    <button type="submit" disabled={payableOptions.length === 0} className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">Post Payable Payment</button>
  </form>;
}
