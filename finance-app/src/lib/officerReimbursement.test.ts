import { describe, expect, it } from 'vitest';
import { JournalEntry } from '../types';
import { checkOfficerReimbursement, NO_OFFICER_PURCHASE_WARNING } from './officerReimbursement';

const money = (value: number) => `₱${value.toFixed(2)}`;
const entry = (id: string, officer: string, lines: JournalEntry['lines'], extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date: '2026-10-01', description: id, project: '', lines,
  transactionDetails: { counterpartyName: officer, eventRelated: false, receiptAttachmentIds: [] },
  ...extra,
});
const owed = (id: string, officer: string, amount: number) => entry(id, officer, [{ accountCode: '5100', debit: amount, credit: 0 }, { accountCode: '2050', debit: 0, credit: amount }]);
const entries = [owed('a', 'ONE', 300), owed('b', 'ZXC', 50)];

describe('checkOfficerReimbursement', () => {
  it('blocks a name that is not in the Amount Payable to Officers table', () => {
    expect(checkOfficerReimbursement(entries, 'ANE', 100, money)).toEqual({ nameError: NO_OFFICER_PURCHASE_WARNING, amountError: '', balance: 0 });
  });

  it('allows up to that officer\'s own balance, not the total', () => {
    expect(checkOfficerReimbursement(entries, ' one ', 300, money)).toEqual({ nameError: '', amountError: '', balance: 300 });
    const over = checkOfficerReimbursement(entries, 'ZXC', 100, money);
    expect(over.amountError).toBe("Reimbursement cannot exceed ZXC's outstanding balance of ₱50.00.");
  });

  it('counts earlier reimbursements and treats a fully reimbursed officer as not in the table', () => {
    const paidPartly = entry('r1', 'ONE', [{ accountCode: '2050', debit: 100, credit: 0 }, { accountCode: '1010', debit: 0, credit: 100 }]);
    expect(checkOfficerReimbursement([...entries, paidPartly], 'ONE', 201, money).amountError).toContain('₱200.00');
    const paidFully = entry('r2', 'ZXC', [{ accountCode: '2050', debit: 50, credit: 0 }, { accountCode: '1010', debit: 0, credit: 50 }]);
    expect(checkOfficerReimbursement([...entries, paidFully], 'ZXC', 10, money).nameError).toBe(NO_OFFICER_PURCHASE_WARNING);
  });

  it('ignores a blank name (the required-name check handles it)', () => {
    expect(checkOfficerReimbursement(entries, '  ', 100, money)).toEqual({ nameError: '', amountError: '', balance: 0 });
  });
});
