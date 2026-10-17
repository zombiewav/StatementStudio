import React from 'react';
import { DatedAmountInputRow, DatedAmountRows } from './DatedAmountRows';

interface MerchandisePaymentRowsProps {
  /** Heading for the payment source, e.g. the organization's available cash. */
  label: string;
  rows: DatedAmountInputRow[];
  onChange: (rows: DatedAmountInputRow[]) => void;
  currencySymbol: string;
  addLabel: string;
  /** Limit for both sections together (cash on hand, or the officer's advance). */
  maxTotal?: number;
}

const BLANK_DATE_HELP = 'Date can be cleared and is optional.';

/** The first row is the payment made on the date the merchandise was received;
 * every row after it is a payment on a later date. Keeping them in one list lets
 * the saved form state and the posting engine stay unchanged. */
export function MerchandisePaymentRows({ label, rows, onChange, currencySymbol, addLabel, maxTotal }: MerchandisePaymentRowsProps): React.ReactElement {
  const first = rows[0] || { id: 'receipt-payment', date: '', amount: '' };
  const later = rows.slice(1);
  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  return (
    <div className="space-y-3 payment-group">
      <p className="text-[12px] font-black uppercase tracking-wide text-indigo-900 dark:text-indigo-200">{label}</p>
      <DatedAmountRows
        label="Payment on the Date Merchandise is Received On Hand"
        rows={[first]}
        onChange={next => onChange([next[0] || first, ...later])}
        currencySymbol={currencySymbol}
        defaultDate=""
        allowMultiple={false}
        allowBlankDates
        allowEmptyAmounts
        blankDateHelp={BLANK_DATE_HELP}
      />
      <DatedAmountRows
        label="Payment on a Later Date for Merchandise Already Received On Hand"
        rows={later}
        onChange={next => onChange([first, ...next])}
        currencySymbol={currencySymbol}
        defaultDate=""
        addLabel={addLabel}
        minRows={0}
        allowBlankDates
        allowEmptyAmounts
        blankDateHelp={BLANK_DATE_HELP}
      />
      {maxTotal !== undefined && total > maxTotal && (
        <p className="text-[12px] font-bold text-rose-700 dark:text-rose-300">Total cannot exceed {currencySymbol}{maxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.</p>
      )}
    </div>
  );
}
