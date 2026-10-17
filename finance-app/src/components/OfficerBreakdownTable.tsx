import React from 'react';
import { OfficerBreakdown } from '../lib/officerBreakdown';

interface OfficerBreakdownTableProps {
  officer: string;
  breakdown: OfficerBreakdown;
  formatCurrency: (value: number) => string;
}

const formatDate = (iso: string): string => {
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString();
};

export const NO_OFFICER_PURCHASE_WARNING = '⚠️ This officer has no recorded purchase of asset or payment of expense yet. Please record the purchase of asset or payment of expense first before recording the reimbursement.';

// "Breakdown of Reimbursement to Specific Accountable Officer": every expense
// or purchase the officer paid personally, the reimbursements so far, and what
// is still owed to that officer.
export function OfficerBreakdownTable({ officer, breakdown, formatCurrency }: OfficerBreakdownTableProps): React.ReactElement {
  if (!officer.trim()) return <></>;
  if (breakdown.rows.length === 0) {
    return <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{NO_OFFICER_PURCHASE_WARNING}</p>;
  }
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 text-[12px] dark:border-slate-700">
      <p className="bg-slate-50 px-3 py-2 font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">Due to Officer – {officer.trim()}</p>
      <div className="grid grid-cols-[5.5rem_1fr_auto] gap-2 border-t border-slate-100 px-3 py-2 font-bold text-slate-500 dark:border-slate-800">
        <span>Date</span><span>Transaction Entered on Behalf of the Organization</span><span className="text-right">Amount</span>
      </div>
      {breakdown.rows.map((row, index) => (
        <div key={`${row.entryId}-${index}`} className="grid grid-cols-[5.5rem_1fr_auto] gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDate(row.date)}</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{row.transaction}</span>
          <span className="text-right font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(row.amount)}</span>
        </div>
      ))}
      <div className="space-y-1 border-t border-slate-200 px-3 py-2 dark:border-slate-700">
        <p className="flex justify-between font-bold text-slate-700 dark:text-slate-200"><span>Total</span><span>{formatCurrency(breakdown.total)}</span></p>
        <p className="flex justify-between font-bold text-slate-700 dark:text-slate-200"><span>Reimbursement</span><span>{formatCurrency(breakdown.reimbursed)}</span></p>
        <p className="flex justify-between font-black text-blue-800 dark:text-blue-200"><span>Remaining Balance</span><span>{formatCurrency(breakdown.remaining)}</span></p>
      </div>
    </div>
  );
}
