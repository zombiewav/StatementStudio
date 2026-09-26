import React, { useState } from 'react';
import { ActivityFeeRecord } from '../types';
import { ActivityFeeFollowUp } from '../lib/activityFees';
import { useFinance } from '../context/FinanceContext';

function RecordCard({ record }: { record: ActivityFeeRecord }): React.ReactElement {
  const { updateActivityFeeRecord, formatCurrency, settings } = useFinance();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const date = new Date().toISOString().slice(0, 10);
  const post = (followUp: ActivityFeeFollowUp) => {
    setError(''); setMessage('');
    try { const updated = updateActivityFeeRecord(record.id, followUp, date, settings.fiscalYear); setMessage(`Updated ${updated.reference}.`); setAmount(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this event.'); }
  };
  const numericAmount = Number(amount || 0);
  return <article className={`rounded-xl border p-4 ${record.status === 'complete' ? 'border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-slate-900' : 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-900 dark:text-slate-100">{record.eventName}</p><p className="mt-1 text-[10px] text-slate-500">{record.reference} • {record.status.replace('-', ' ')}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${record.status === 'complete' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{record.status === 'complete' ? 'complete' : 'incomplete'}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 sm:grid-cols-4"><span>Expected<br/><b>{formatCurrency(record.totalExpected)}</b></span><span>Collected<br/><b>{formatCurrency(record.totalCollected)}</b></span><span>Receivable<br/><b>{formatCurrency(record.receivableBalance)}</b></span><span>{record.status === 'refund-due' ? 'Refund remaining' : 'Deferred'}<br/><b>{formatCurrency(record.deferredBalance)}</b></span></div>
    {record.status !== 'complete' && <div className="mt-4 space-y-2 border-t border-rose-200 pt-3 dark:border-rose-500/20"><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount for this update" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900" />
      <div className="flex flex-wrap gap-2">
        {record.status === 'receivable' && <button onClick={() => post({ type: 'collect-receivable', amount: numericAmount })} className="rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white">Collect unpaid fee</button>}
        {['scheduled','postponed'].includes(record.status) && <><button onClick={() => post({ type: 'event-held', amount: numericAmount })} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">Event held</button><button onClick={() => post({ type: 'postpone', amount: numericAmount })} className="rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-bold text-white">Postpone</button><button onClick={() => post({ type: 'cancel-refundable', amount: numericAmount })} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white">Cancel — refundable</button><button onClick={() => post({ type: 'cancel-nonrefundable' })} className="rounded-lg bg-slate-700 px-3 py-2 text-[10px] font-bold text-white">Cancel — non-refundable</button></>}
        {record.status === 'refund-due' && <button onClick={() => post({ type: 'refund', amount: numericAmount })} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white">Record refund</button>}
      </div></div>}
    {error && <p className="mt-2 text-[10px] font-bold text-rose-600">{error}</p>}{message && <p className="mt-2 text-[10px] font-bold text-emerald-600">{message}</p>}
    <details className="mt-3"><summary className="cursor-pointer text-[10px] font-bold text-blue-700 dark:text-blue-300">Transaction history ({record.history.length})</summary><div className="mt-2 space-y-1">{record.history.map(item => <p key={item.id} className="text-[9px] text-slate-500">{item.date} • {item.reportingPeriod} • {item.action.replace(/-/g, ' ')} • {formatCurrency(item.amount)}</p>)}</div></details>
  </article>;
}

export function ActivityFeeReview(): React.ReactElement | null {
  const { activityFeeRecords } = useFinance();
  if (activityFeeRecords.length === 0) return null;
  return <section className="space-y-3"><div><h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Activity Fee History</h3><p className="mt-1 text-[10px] text-slate-500">Continue collections, postponements, cancellations, and refunds without losing prior-period history.</p></div>{[...activityFeeRecords].reverse().map(record => <RecordCard key={record.id} record={record} />)}</section>;
}
