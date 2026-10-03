import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { counterpartyBalance, counterpartyBalances } from '../lib/counterpartyBalances';
import { buildPriorPeriodPayablePayment, PayablePaymentMethod, PRIOR_PERIOD_PAYABLE_CODES, PriorPeriodPayableCode, remainingPriorPeriodPayable } from '../lib/payablePayments';

const GENERAL_FUND = 'General Fund Operations';
const methods: { value: PayablePaymentMethod; label: string }[] = [
  { value: 'organization-funds', label: 'Paid directly by the organization' },
  { value: 'officer-personal', label: 'Paid by an officer using personal money - to be reimbursed' },
  { value: 'officer-advance', label: 'Paid using a cash advance previously given to the officer' },
  { value: 'combination', label: 'Combination of organization funds, officer personal money, and/or cash advance' },
];

const amount = (value: string) => Number(value) || 0;

export function PayablesEntry(): React.ReactElement {
  const { accounts, journalEntries, addJournalEntry, accountBalances, openingBalances, formatCurrency, settings } = useFinance();
  const [payableCode, setPayableCode] = useState<PriorPeriodPayableCode | ''>('');
  const [method, setMethod] = useState<PayablePaymentMethod>('organization-funds');
  const [date, setDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [organizationAmount, setOrganizationAmount] = useState('');
  const [officerAmount, setOfficerAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [officer, setOfficer] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const payableOptions = useMemo(() => PRIOR_PERIOD_PAYABLE_CODES.map(code => ({
    code,
    name: accounts.find(account => account.code === code)?.name || code,
    remaining: remainingPriorPeriodPayable(openingBalances[code] || 0, code, journalEntries),
  })).filter(option => option.remaining > 0), [accounts, journalEntries, openingBalances]);
  const selected = payableOptions.find(option => option.code === payableCode);
  const officerAdvances = useMemo(() => counterpartyBalances(journalEntries, '1250', 'Debit'), [journalEntries]);
  const availableAdvance = officer ? counterpartyBalance(journalEntries, '1250', 'Debit', officer) : 0;
  const availableCash = Math.max(0, accountBalances['1010'] || 0);
  const showOrganization = method === 'organization-funds' || method === 'combination';
  const showOfficer = method === 'officer-personal' || method === 'combination';
  const showAdvance = method === 'officer-advance' || method === 'combination';
  const paymentTotal = (showOrganization ? amount(organizationAmount) : 0) + (showOfficer ? amount(officerAmount) : 0) + (showAdvance ? amount(advanceAmount) : 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!settings.semester || !settings.reportingYear) return setError('Set the organization Semester and Year before posting.');
    if (!payableCode || !selected) return setError('Select a payable account with a remaining beginning balance.');
    if (!date) return setError('Enter the transaction date.');
    if ((showOfficer || showAdvance) && !officer.trim()) return setError('Select or enter the accountable officer.');
    try {
      const posting = buildPriorPeriodPayablePayment({ payableAccountCode: payableCode, paymentMethod: method, transactionDate: date, paymentDate, organizationAmount: amount(organizationAmount), officerAmount: amount(officerAmount), advanceAmount: amount(advanceAmount), remainingOpeningBalance: selected.remaining, availableCash, availableAdvance });
      addJournalEntry(date, `Payment of Previous-Period ${selected.name}`, GENERAL_FUND, posting.lines, undefined, undefined, {
        transactionType: 'Payment of Previous-Period Payables',
        details: { eventRelated: false, receiptAttachmentIds: [], priorPeriodPayableAccountCode: payableCode, priorPeriodPayablePaymentAmount: posting.total, priorPeriodPayablePaymentMethod: method, counterpartyName: officer.trim() || selected.name },
      });
      setMessage('Payable payment posted successfully.');
      setPayableCode(''); setDate(''); setPaymentDate(''); setOrganizationAmount(''); setOfficerAmount(''); setAdvanceAmount(''); setOfficer('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to post the payable payment.'); }
  };

  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Payment of Beginning Payables</h3>
    <p className="mt-1 text-[10px] font-medium text-slate-500">This is only for payables carried forward from the previous reporting period. Current-period payables remain payable through Review.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Payable account<select value={payableCode} onChange={event => setPayableCode(event.target.value as PriorPeriodPayableCode)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="">Select an account with a beginning balance…</option>{payableOptions.map(option => <option key={option.code} value={option.code}>{option.code} - {option.name} — {formatCurrency(option.remaining)} remaining</option>)}</select></label>
      {payableOptions.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 sm:col-span-2">No beginning payable balance is available. The dropdown remains restricted until a payable is carried forward from the preceding reporting period.</p>}
      <label className="text-[10px] font-bold uppercase text-slate-600">Transaction date<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
      <label className="text-[10px] font-bold uppercase text-slate-600">Payment date optional<input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
      <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Payment method<select value={method} onChange={event => setMethod(event.target.value as PayablePaymentMethod)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">{methods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {(showOfficer || showAdvance) && <label className="text-[10px] font-bold uppercase text-slate-600 sm:col-span-2">Accountable officer<input list="payable-officers" value={officer} onChange={event => setOfficer(event.target.value)} placeholder="Officer name" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><datalist id="payable-officers">{officerAdvances.map(record => <option key={record.name} value={record.name} />)}</datalist>{showAdvance && <span className="mt-1 block text-[10px] text-indigo-700">Available advance for this officer: {formatCurrency(availableAdvance)}</span>}</label>}
      {showOrganization && <label className="text-[10px] font-bold uppercase text-slate-600">Organization cash payment<input type="number" min="0" step="0.01" value={organizationAmount} onChange={event => setOrganizationAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><span className="mt-1 block text-[10px] normal-case text-slate-500">Available cash: {formatCurrency(availableCash)}</span></label>}
      {showOfficer && <label className="text-[10px] font-bold uppercase text-slate-600">Officer personal payment<input type="number" min="0" step="0.01" value={officerAmount} onChange={event => setOfficerAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /><span className="mt-1 block text-[10px] normal-case text-slate-500">Reimburse the officer separately under Reimbursement to Officers.</span></label>}
      {showAdvance && <label className="text-[10px] font-bold uppercase text-slate-600">Officer advance payment<input type="number" min="0" step="0.01" value={advanceAmount} onChange={event => setAdvanceAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>}
      <div className="rounded-lg bg-slate-50 p-3 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 sm:col-span-2">Total payment: {formatCurrency(paymentTotal)}{selected && <span className="ml-2">Maximum remaining beginning balance: {formatCurrency(selected.remaining)}</span>}</div>
    </div>
    {error && <p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}{message && <p className="mt-3 text-xs font-semibold text-emerald-600">{message}</p>}
    <button type="submit" disabled={payableOptions.length === 0} className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">Post Payable Payment</button>
  </form>;
}
