// Pure computation behind every account's running balance and each Chart of
// Accounts type's total (Total Assets, Total Liabilities, etc.). Kept
// framework-free, like journalEngine.ts and activitiesBreakdown.ts, so it can
// be tested directly and shared by every place that needs these sums instead
// of each re-deriving its own copy.
import { Account, AccountType, JournalEntry } from '../types';

// The polarity a type's balance normally carries. An account whose own
// normalBalance disagrees with its type's natural polarity is a contra
// account (e.g. Accumulated Depreciation: type Assets, but Credit-normal)
// and must subtract from, not add to, its type's total.
const NATURAL_POLARITY: Record<AccountType, Account['normalBalance']> = {
  Assets: 'Debit',
  Liabilities: 'Credit',
  'Fund Balance': 'Credit',
  Revenue: 'Credit',
  Expenses: 'Debit',
};

export function isContraAccount(account: Account): boolean {
  return account.normalBalance !== NATURAL_POLARITY[account.type];
}

// Every account's balance, expressed in that account's own normal-balance
// polarity (a Debit-normal account's balance grows with debits, a
// Credit-normal account's grows with credits).
export function computeAccountBalances(entries: JournalEntry[], accounts: Account[]): Record<string, number> {
  const balances: Record<string, number> = {};
  accounts.forEach(acc => {
    balances[acc.code] = 0;
  });

  entries.forEach(je => {
    je.lines.forEach(line => {
      const acc = accounts.find(a => a.code === line.accountCode);
      if (!acc) return;

      if (acc.normalBalance === 'Debit') {
        balances[acc.code] = (balances[acc.code] || 0) + line.debit - line.credit;
      } else {
        balances[acc.code] = (balances[acc.code] || 0) + line.credit - line.debit;
      }
    });
  });

  return balances;
}

// Each Chart of Accounts type's total, correctly netting contra accounts
// (an account whose normalBalance opposes its type's natural polarity
// subtracts from that type's total instead of adding to it).
export function computeTypeTotals(balances: Record<string, number>, accounts: Account[]): Record<AccountType, number> {
  const totals: Record<AccountType, number> = {
    Assets: 0,
    Liabilities: 0,
    'Fund Balance': 0,
    Revenue: 0,
    Expenses: 0,
  };

  accounts.forEach(acc => {
    const bal = balances[acc.code] || 0;
    totals[acc.type] += isContraAccount(acc) ? -bal : bal;
  });

  return totals;
}
