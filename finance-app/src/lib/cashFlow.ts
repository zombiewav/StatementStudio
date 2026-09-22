import { Account, JournalEntry } from '../types';
import { CASH_ACCOUNT_CODES } from './cashAccounts';

const INVESTING_ASSET_CODES = ['1500', '1600', '1650'];

export interface CashFlowDetails {
  cashInflows: number;
  cashOutflows: number;
  netOperating: number;
  netInvesting: number;
  netFinancing: number;
  netChange: number;
  beginningCash: number;
  endingCash: number;
}

export function computeCashFlowDetails(
  entries: JournalEntry[],
  accounts: Account[],
  startDate: string,
  endDate: string
): CashFlowDetails {
  const beginningCash = entries
    .filter(entry => entry.date < startDate)
    .flatMap(entry => entry.lines)
    .filter(line => CASH_ACCOUNT_CODES.includes(line.accountCode))
    .reduce((sum, line) => sum + line.debit - line.credit, 0);

  let cashInflows = 0;
  let cashOutflows = 0;
  let netInvesting = 0;
  let netFinancing = 0;

  entries
    .filter(entry => entry.date >= startDate && entry.date <= endDate)
    .forEach(entry => {
      const otherLines = entry.lines.filter(line => !CASH_ACCOUNT_CODES.includes(line.accountCode));
      const isFinancing = otherLines.some(line => {
        const account = accounts.find(candidate => candidate.code === line.accountCode);
        return line.accountCode === '2200' || account?.type === 'Fund Balance';
      });
      const isInvesting = otherLines.some(line => INVESTING_ASSET_CODES.includes(line.accountCode));

      entry.lines
        .filter(line => CASH_ACCOUNT_CODES.includes(line.accountCode))
        .forEach(line => {
          const cashChange = line.debit - line.credit;
          if (isFinancing) netFinancing += cashChange;
          else if (isInvesting) netInvesting += cashChange;
          else if (cashChange >= 0) cashInflows += cashChange;
          else cashOutflows += cashChange;
        });
    });

  const netOperating = cashInflows + cashOutflows;
  const netChange = netOperating + netInvesting + netFinancing;
  return {
    cashInflows,
    cashOutflows,
    netOperating,
    netInvesting,
    netFinancing,
    netChange,
    beginningCash,
    endingCash: beginningCash + netChange,
  };
}
