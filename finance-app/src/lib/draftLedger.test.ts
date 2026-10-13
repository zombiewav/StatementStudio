import { describe, expect, it } from 'vitest';
import { Account, JournalEntry } from '../types';
import { ledgerWithoutDraftEntry } from './draftLedger';
import { counterpartyBalance } from './counterpartyBalances';
import { aggregateAvailableMerchandisePrepayments } from './merchandiseAcquisition';

const accounts: Account[] = [
  { code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1270', name: 'Advances to Suppliers', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '1700', name: 'Inventory - Merchandise', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true },
  { code: '2050', name: 'Due to Officers', type: 'Liabilities', normalBalance: 'Credit', description: '', isActive: true },
  { code: '4030', name: 'Contributions', type: 'Revenue', normalBalance: 'Credit', description: '', isActive: true },
];

const entry = (id: string, lines: JournalEntry['lines'], extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, reference: id, date: '2026-10-12', description: id, project: 'General Fund Operations', lines, ...extra,
});
const details = (extra: Record<string, unknown>) => ({ transactionDetails: { eventRelated: false, receiptAttachmentIds: [], ...extra } as never });

const capital = entry('capital', [{ accountCode: '1010', debit: 10000, credit: 0 }, { accountCode: '4030', debit: 0, credit: 10000 }]);
const laptop = entry('laptop', [{ accountCode: '1700', debit: 700, credit: 0 }, { accountCode: '2050', debit: 0, credit: 700 }], details({ counterpartyName: 'Alpha' }));
const reimbursementDraft = entry('reimb', [{ accountCode: '2050', debit: 700, credit: 0 }, { accountCode: '1010', debit: 0, credit: 700 }], { isDraft: true, ...details({ counterpartyName: 'Alpha' }) });

describe('ledgerWithoutDraftEntry', () => {
  it('returns the ledger unchanged when no draft is being edited', () => {
    const entries = [capital, laptop];
    const balances = { '1010': 10000 };
    const view = ledgerWithoutDraftEntry(entries, undefined, accounts, {}, balances);
    expect(view.entries).toBe(entries);
    expect(view.balances).toBe(balances);
  });

  it('frees what the draft itself consumed: payable, cash and balances', () => {
    const entries = [capital, laptop, reimbursementDraft];
    expect(counterpartyBalance(entries, '2050', 'Credit', 'Alpha')).toBe(0);
    const view = ledgerWithoutDraftEntry(entries, 'reimb', accounts, {}, {});
    expect(counterpartyBalance(view.entries, '2050', 'Credit', 'Alpha')).toBe(700);
    expect(view.balances['1010']).toBe(10000);
    expect(view.balances['2050']).toBe(700);
  });

  it('keeps carried-forward opening balances in the recalculated balances', () => {
    const view = ledgerWithoutDraftEntry([capital, reimbursementDraft], 'reimb', accounts, { '2050': 300 }, {});
    expect(view.balances['2050']).toBe(300);
  });

  it('makes the downpayment linked by the draft available again', () => {
    const downpayment = entry('dp', [{ accountCode: '1270', debit: 500, credit: 0 }, { accountCode: '1010', debit: 0, credit: 500 }], details({ merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1' }));
    const acquisitionDraft = entry('acq', [{ accountCode: '1700', debit: 1000, credit: 0 }, { accountCode: '1270', debit: 0, credit: 500 }, { accountCode: '1010', debit: 0, credit: 500 }], {
      isDraft: true,
      ...details({ merchandiseItem: 'Pins', merchandiseBatch: 'Batch 1', merchandisePrepaymentEntryId: 'dp', merchandisePrepaymentEntryIds: ['dp'] }),
    });
    const entries = [capital, downpayment, acquisitionDraft];
    expect(aggregateAvailableMerchandisePrepayments(entries, 'Pins', 'Batch 1').entryIds).toEqual([]);
    const view = ledgerWithoutDraftEntry(entries, 'acq', accounts, {}, {});
    expect(aggregateAvailableMerchandisePrepayments(view.entries, 'Pins', 'Batch 1')).toMatchObject({ entryIds: ['dp'], amount: 500 });
  });
});
