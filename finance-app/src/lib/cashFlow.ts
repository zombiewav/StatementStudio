import { Account, JournalEntry } from '../types';
import { CASH_ACCOUNT_CODES } from './cashAccounts';

const INVESTING_ASSET_CODES = ['1500', '1600', '1650'];

export const CASH_FLOW_OPERATING_ROWS = [
  { key: 'membershipFees', label: 'Membership Fees', accountCodes: ['4040'] },
  { key: 'rentRevenue', label: 'Rent Revenue', accountCodes: ['4055'] },
  { key: 'salesRevenue', label: 'Sales Revenue', accountCodes: ['4070'] },
  { key: 'activityFees', label: 'Activity Fees', accountCodes: ['4090'] },
  { key: 'sponsorshipsAndDonations', label: 'Sponsorships and Donations', accountCodes: ['4030', '4035', '4100', '4110'] },
  { key: 'interestIncome', label: 'Interest Income', accountCodes: ['4060'] },
] as const;

export const CASH_FLOW_EXPENSE_ROWS = [
  { key: 'costOfSales', label: 'Cost of Sales', accountCodes: ['5240'] },
  { key: 'mealsAndRefreshments', label: 'Meals and Refreshments Expense', accountCodes: ['5080'] },
  { key: 'officeSupplies', label: 'Office Supplies Expense', accountCodes: ['5040'] },
  { key: 'transportation', label: 'Transportation Expense', accountCodes: ['5050'] },
  { key: 'awardsAndPrizes', label: 'Awards and Prizes Expense', accountCodes: ['5120'] },
  { key: 'communication', label: 'Communication Expense', accountCodes: ['5130'] },
  { key: 'printing', label: 'Printing Expense', accountCodes: ['5140'] },
  { key: 'freight', label: 'Freight Expense', accountCodes: ['5150'] },
  { key: 'eventSupplies', label: 'Event Supplies Expense', accountCodes: ['5160'] },
  { key: 'membership', label: 'Membership Expense', accountCodes: ['5210'] },
  { key: 'food', label: 'Food Expense', accountCodes: ['5270'] },
  { key: 'repair', label: 'Repair Expense', accountCodes: ['5070'] },
  { key: 'printingSupplies', label: 'Printing Supplies Expense', accountCodes: ['5280'] },
  { key: 'depreciationEquipment', label: 'Depreciation Expense - Equipment', accountCodes: ['5090'] },
  { key: 'depreciationFurniture', label: 'Depreciation Expense - Furniture and Fixtures', accountCodes: ['5095'] },
  { key: 'rent', label: 'Rent Expense', accountCodes: ['5020'] },
  { key: 'suppliesAndMaterials', label: 'Supplies and Materials Expense', accountCodes: ['5290'] },
  { key: 'professionalFees', label: 'Professional Fee Expense', accountCodes: ['5300'] },
  { key: 'logisticsAndVenue', label: 'Logistics and Venue Expense', accountCodes: ['5310'] },
  { key: 'bankCharges', label: 'Bank Charges', accountCodes: ['5100'] },
] as const;

type OperatingRowKey = (typeof CASH_FLOW_OPERATING_ROWS)[number]['key'];
type ExpenseRowKey = (typeof CASH_FLOW_EXPENSE_ROWS)[number]['key'];

export interface CashFlowDetails {
  cashInflows: number;
  cashOutflows: number;
  netOperating: number;
  netInvesting: number;
  netFinancing: number;
  netChange: number;
  beginningCash: number;
  endingCash: number;
  operatingInflows: Record<OperatingRowKey, number>;
  operatingOutflows: Record<ExpenseRowKey, number>;
  otherReceipts: number;
  otherExpenses: number;
  equipmentSales: number;
  equipmentPurchases: number;
  furnitureSales: number;
  furniturePurchases: number;
  financingCashFlows: number;
}

function zeroRows<T extends readonly { key: string }[]>(rows: T): Record<T[number]['key'], number> {
  return Object.fromEntries(rows.map(row => [row.key, 0])) as Record<T[number]['key'], number>;
}

function findRowKey<T extends readonly { key: string; accountCodes: readonly string[] }[]>(rows: T, accountCode: string): T[number]['key'] | undefined {
  return rows.find(row => row.accountCodes.includes(accountCode))?.key;
}

export function computeCashFlowDetails(
  entries: JournalEntry[],
  accounts: Account[],
  startDate: string,
  endDate: string,
  openingCash = 0,
): CashFlowDetails {
  const beginningCash = openingCash + entries
    .filter(entry => entry.date < startDate)
    .flatMap(entry => entry.lines)
    .filter(line => CASH_ACCOUNT_CODES.includes(line.accountCode))
    .reduce((sum, line) => sum + line.debit - line.credit, 0);

  let cashInflows = 0;
  let cashOutflows = 0;
  let netInvesting = 0;
  let netFinancing = 0;
  const operatingInflows = zeroRows(CASH_FLOW_OPERATING_ROWS);
  const operatingOutflows = zeroRows(CASH_FLOW_EXPENSE_ROWS);
  let otherReceipts = 0;
  let otherExpenses = 0;
  let equipmentSales = 0;
  let equipmentPurchases = 0;
  let furnitureSales = 0;
  let furniturePurchases = 0;

  entries
    .filter(entry => entry.date >= startDate && entry.date <= endDate)
    .forEach(entry => {
      const otherLines = entry.lines.filter(line => !CASH_ACCOUNT_CODES.includes(line.accountCode));
      const isFinancing = otherLines.some(line => {
        const account = accounts.find(candidate => candidate.code === line.accountCode);
        return line.accountCode === '2200' || account?.type === 'Fund Balance';
      });
      const isInvesting = otherLines.some(line => INVESTING_ASSET_CODES.includes(line.accountCode));

      const cashChange = entry.lines
        .filter(line => CASH_ACCOUNT_CODES.includes(line.accountCode))
        .reduce((sum, line) => sum + line.debit - line.credit, 0);
      if (cashChange === 0) return;

      if (isFinancing) {
        netFinancing += cashChange;
        return;
      }

      if (isInvesting) {
        netInvesting += cashChange;
        const furnitureCounterpart = otherLines.some(line => line.accountCode === '1650');
        if (furnitureCounterpart) {
          if (cashChange > 0) furnitureSales += cashChange;
          else furniturePurchases += cashChange;
        } else if (cashChange > 0) equipmentSales += cashChange;
        else equipmentPurchases += cashChange;
        return;
      }

      const cashCounterpartLines = otherLines.filter(line => line.credit !== line.debit);
      cashCounterpartLines.forEach(line => {
        const amount = line.credit - line.debit;
        const inflowKey = findRowKey(CASH_FLOW_OPERATING_ROWS, line.accountCode);
        const outflowKey = findRowKey(CASH_FLOW_EXPENSE_ROWS, line.accountCode);
        if (amount > 0) {
          cashInflows += amount;
          if (inflowKey) operatingInflows[inflowKey] += amount;
          else otherReceipts += amount;
        } else {
          cashOutflows += amount;
          if (outflowKey) operatingOutflows[outflowKey] += amount;
          else otherExpenses += amount;
        }
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
    operatingInflows,
    operatingOutflows,
    otherReceipts,
    otherExpenses,
    equipmentSales,
    equipmentPurchases,
    furnitureSales,
    furniturePurchases,
    financingCashFlows: netFinancing,
  };
}
