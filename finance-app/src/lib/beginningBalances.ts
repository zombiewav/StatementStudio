import { Account } from '../types';

export const BEGINNING_BALANCES_DESCRIPTION = 'Beginning Balances';

export interface BeginningBalancePosting {
  lines: { accountCode: string; debit: number; credit: number }[];
  total: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** One debit line per active asset account with an opening amount, credited in total to Fund Balance (3010). */
export function buildBeginningBalancePosting(accounts: Pick<Account, 'code' | 'type' | 'isActive'>[], amounts: Record<string, string>): BeginningBalancePosting | null {
  const lines: BeginningBalancePosting['lines'] = [];
  let total = 0;
  accounts.filter(account => account.type === 'Assets' && account.isActive).forEach(account => {
    const amount = cents(Number(amounts[account.code] || 0));
    if (amount > 0) {
      lines.push({ accountCode: account.code, debit: amount, credit: 0 });
      total = cents(total + amount);
    }
  });
  if (total <= 0) return null;
  lines.push({ accountCode: '3010', debit: 0, credit: total });
  return { lines, total };
}

