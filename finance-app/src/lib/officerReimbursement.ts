import { JournalEntry } from '../types';
import { counterpartySummary } from './counterpartyBalances';

export const NO_OFFICER_PURCHASE_WARNING = '⚠️ This officer has no recorded purchase of asset or payment of expense yet. Please record the purchase of asset or payment of expense first before recording the reimbursement.';

export interface OfficerReimbursementCheck {
  /** The typed name is not in the Amount Payable to Officers table. */
  nameError: string;
  /** The amount is more than that officer's outstanding balance. */
  amountError: string;
  /** What the named officer is still owed (0 when the name is not in the table). */
  balance: number;
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/** Client (Oct 20 2026): a reimbursement is limited by the named officer's own balance in Due to Officers (2050).
 * A name that has no payable in the table cannot be reimbursed at all. */
export function checkOfficerReimbursement(entries: JournalEntry[], officer: string, amount: number, formatCurrency: (value: number) => string): OfficerReimbursementCheck {
  const key = officer.trim().toLocaleLowerCase();
  if (!key) return { nameError: '', amountError: '', balance: 0 };
  const row = counterpartySummary(entries, '2050', 'Credit').find(item => item.name.toLocaleLowerCase() === key && item.balance > 0);
  if (!row) return { nameError: NO_OFFICER_PURCHASE_WARNING, amountError: '', balance: 0 };
  const balance = cents(row.balance);
  return {
    nameError: '',
    amountError: amount > balance ? `Reimbursement cannot exceed ${row.name}'s outstanding balance of ${formatCurrency(balance)}.` : '',
    balance,
  };
}
