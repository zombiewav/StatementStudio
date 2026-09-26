import { Account, JournalEntry, JournalLine } from '../types';
import { buildCompoundJournalLines } from './journalEngine';

export const MERCHANDISE_INVENTORY_CODE = '1700';
export const COST_OF_SALES_CODE = '5240';

export interface AccountHistoryLine {
  entryId: string;
  date: string;
  reference: string;
  description: string;
  project: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface InventoryMovement extends AccountHistoryLine {
  movement: 'increase' | 'decrease';
}

export interface InventorySummary {
  totalAdded: number;
  totalReleased: number;
  costOfSales: number;
  balance: number;
  movements: InventoryMovement[];
}

export function merchandiseSaleCostError(cost: number, inventoryBalance: number): string | null {
  if (!Number.isFinite(cost) || cost <= 0) return 'Enter the cost of the merchandise sold so inventory and Cost of Sales are updated.';
  if (cost > inventoryBalance) return 'The merchandise cost sold cannot exceed the current inventory balance.';
  return null;
}

export function buildMerchandiseSaleLines(saleAmount: number, inventoryCost: number): JournalLine[] {
  if (!Number.isFinite(saleAmount) || saleAmount <= 0) throw new Error('Merchandise sale amount must be greater than zero.');
  if (!Number.isFinite(inventoryCost) || inventoryCost <= 0) throw new Error('Merchandise inventory cost must be greater than zero.');
  return buildCompoundJournalLines([
    { debitAccountCode: '1010', creditAccountCode: '4070', amount: saleAmount },
    { debitAccountCode: COST_OF_SALES_CODE, creditAccountCode: MERCHANDISE_INVENTORY_CODE, amount: inventoryCost },
  ]);
}

export function buildAccountTransactionHistory(account: Account, entries: JournalEntry[]): AccountHistoryLine[] {
  let runningBalance = 0;
  const debitNormal = account.normalBalance === 'Debit';

  return entries.flatMap(entry => entry.lines
    .map((line, lineIndex) => ({ entry, line, lineIndex, postingDate: line.date || entry.date }))
    .filter(({ line }) => line.accountCode === account.code))
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate)
      || a.entry.reference.localeCompare(b.entry.reference)
      || a.lineIndex - b.lineIndex)
    .map(({ entry, line, postingDate }) => {
      runningBalance += debitNormal ? line.debit - line.credit : line.credit - line.debit;
      return {
        entryId: entry.id,
        date: postingDate,
        reference: entry.reference,
        description: entry.description,
        project: entry.project,
        debit: line.debit,
        credit: line.credit,
        runningBalance,
      };
    });
}

export function buildInventorySummary(entries: JournalEntry[]): InventorySummary {
  const inventoryAccount: Account = {
    code: MERCHANDISE_INVENTORY_CODE,
    name: 'Inventory - Merchandise',
    type: 'Assets',
    normalBalance: 'Debit',
    description: '',
    isActive: true,
  };
  const history = buildAccountTransactionHistory(inventoryAccount, entries);
  const totalAdded = history.reduce((sum, line) => sum + line.debit, 0);
  const totalReleased = history.reduce((sum, line) => sum + line.credit, 0);
  const costOfSales = entries.reduce((sum, entry) => sum + entry.lines
    .filter(line => line.accountCode === COST_OF_SALES_CODE)
    .reduce((lineSum, line) => lineSum + line.debit - line.credit, 0), 0);

  return {
    totalAdded,
    totalReleased,
    costOfSales,
    balance: totalAdded - totalReleased,
    movements: history.map(line => ({ ...line, movement: line.debit >= line.credit ? 'increase' : 'decrease' })),
  };
}
