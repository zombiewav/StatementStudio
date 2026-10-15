import { JournalEntry, JournalLine } from '../types';

export const RETIREMENT_TYPE = 'Retirement of PPE';
export const LOSS_ON_DISPOSAL_CODE = '5370';

export interface PpeItem {
  code: string;
  label: string;
  purchaseType: string;
  depreciationType: string;
  accumulatedAccountCode: '1550' | '1660';
  depreciationExpenseCode: '5090' | '5095';
}

const equipment = (code: string, label: string, depreciationLabel = label): PpeItem => ({
  code, label, purchaseType: `Purchase of ${label}`, depreciationType: `Depreciation of ${depreciationLabel}`,
  accumulatedAccountCode: '1550', depreciationExpenseCode: '5090',
});
const furniture = (code: string, label: string, purchaseType: string, depreciationType: string): PpeItem => ({
  code, label, purchaseType, depreciationType, accumulatedAccountCode: '1660', depreciationExpenseCode: '5095',
});

// The PPE items the Chart of Accounts lists, each tied to the asset account it is bought into and the
// depreciation type that later writes it down. Retired items (Computer Hardware, Extension Wire, ...) are left out.
export const PPE_ITEMS: PpeItem[] = [
  equipment('1501', 'Laptop'), equipment('1502', 'Projector'), equipment('1503', 'Printer'),
  equipment('1504', 'UPS (Uninterrupted Power System)'), equipment('1505', 'Cash Box'), equipment('1506', 'HDMI'),
  equipment('1507', 'WIFI Box'), equipment('1508', 'Microphone'), equipment('1509', 'Flash Drive'), equipment('1510', 'Mouse'),
  equipment('1511', 'Speaker'), equipment('1512', 'Projector Stand'), equipment('1513', 'Adaptor'),
  furniture('1651', 'Cabinet', 'Purchase of Cabinet', 'Depreciation of Cabinet'),
  furniture('1652', 'Chairs', 'Purchase Chairs', 'Depreciation of Chairs'),
  furniture('1653', 'Tables/Desk', 'Purchase of Tables/Desks', 'Depreciation of Tables/Desk'),
];

export interface PpeItemBalance {
  item: PpeItem;
  quantity: number;
  cost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
}

const money = (value: number) => Math.round(value * 100) / 100;
const active = (entry: JournalEntry) => !entry.isDraft && !entry.reversalOfEntryId && !entry.reversedByEntryId;
const lineTotal = (entry: JournalEntry, code: string, side: 'debit' | 'credit') =>
  entry.lines.filter(line => line.accountCode === code).reduce((sum, line) => sum + line[side] - line[side === 'debit' ? 'credit' : 'debit'], 0);

export const ppeItemForPurchase = (type: string | undefined) => PPE_ITEMS.find(item => item.purchaseType === type);
export const ppeItemForDepreciation = (type: string | undefined) => PPE_ITEMS.find(item => item.depreciationType === type);

/**
 * What the organization still holds of each PPE item: purchased quantity and cost (plus anything carried in
 * from the previous semester), less the depreciation posted against it. Purchases saved before quantities were
 * asked for count as one unit. An opening balance on the asset account with no carried item detail is treated
 * as one unit of that item so it can still be depreciated.
 */
export function buildPpeItemBalances(entries: JournalEntry[], openingBalances: Record<string, number> = {}): PpeItemBalance[] {
  return PPE_ITEMS.flatMap(item => {
    let quantity = 0;
    let cost = 0;
    let accumulated = 0;
    let carriedCost = 0;
    entries.filter(active).forEach(entry => {
      const details = entry.transactionDetails;
      if (details?.carriedForward && details.ppeItemCode === item.code) {
        quantity += details.ppeQuantity || 0;
        cost += details.ppeCarriedCost || 0;
        carriedCost += details.ppeCarriedCost || 0;
        accumulated += details.ppeCarriedAccumulated || 0;
        return;
      }
      if (entry.lines.length === 0) return;
      const type = entry.transactionType ?? entry.description;
      if (type === RETIREMENT_TYPE && details?.ppeItemCode === item.code) {
        quantity -= details.ppeRetiredQuantity || 0;
        cost -= details.ppeRetiredCost || 0;
        accumulated -= details.ppeRetiredAccumulated || 0;
        return;
      }
      if (ppeItemForPurchase(type)?.code === item.code) {
        const purchased = lineTotal(entry, item.code, 'debit');
        if (purchased > 0) { cost += purchased; quantity += details?.ppeQuantity || 1; }
      }
      if (ppeItemForDepreciation(type)?.code === item.code) accumulated += lineTotal(entry, item.depreciationExpenseCode, 'debit');
    });
    const untracked = money((openingBalances[item.code] || 0) - carriedCost);
    if (untracked > 0.005) { cost += untracked; quantity += 1; }
    if (cost <= 0.005) return [];
    return [{ item, quantity, cost: money(cost), accumulatedDepreciation: money(accumulated), netBookValue: money(Math.max(0, cost - accumulated)) }];
  });
}

/** Zero-line entries that carry each held item's quantity, cost and depreciation into a new semester. */
export function carryForwardPpeItems(entries: JournalEntry[], openingBalances: Record<string, number>, date: string): JournalEntry[] {
  return buildPpeItemBalances(entries, openingBalances).map(balance => ({
    id: `je-ppe-carried-${balance.item.code}-${date}`,
    reference: 'B/F',
    date,
    description: `Beginning Balances — PPE detail: ${balance.item.label}`,
    project: 'General Fund Operations',
    lines: [],
    transactionType: 'Beginning Balances',
    transactionDetails: {
      eventRelated: false, receiptAttachmentIds: [], carriedForward: true,
      ppeItemCode: balance.item.code, ppeQuantity: balance.quantity, ppeCarriedCost: balance.cost, ppeCarriedAccumulated: balance.accumulatedDepreciation,
    },
  }));
}

export type PpeRetirementCase = 'positive' | 'zero' | 'negative';

export interface PpeRetirementPlan {
  error?: string;
  quantity: number;
  cost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  kind?: PpeRetirementCase;
  lines: JournalLine[];
}

export const PPE_NEGATIVE_NBV_MESSAGE = 'Unable to proceed because the accumulated depreciation exceeds the original cost of the asset being disposed of. Please review the recorded PPE and depreciation transactions.';

/**
 * Retiring part or all of an item: equal cost and depreciation per remaining unit, so each disposed unit takes
 * its share. Disposing every remaining unit takes the exact remaining amounts (no rounding leftovers).
 * Net Book Value above zero is written off as a loss; zero needs no loss; negative is refused outright.
 */
export function planPpeRetirement(balance: PpeItemBalance, quantityInput: number, date: string): PpeRetirementPlan {
  const empty = { quantity: 0, cost: 0, accumulatedDepreciation: 0, netBookValue: 0, lines: [] as JournalLine[] };
  if (!Number.isInteger(quantityInput) || quantityInput <= 0) return { ...empty, error: 'Enter the quantity to be disposed: a whole number greater than zero.' };
  if (quantityInput > balance.quantity) return { ...empty, error: `The quantity to be disposed cannot exceed the available quantity of ${balance.quantity}.` };
  const all = quantityInput === balance.quantity;
  const cost = all ? balance.cost : money(balance.cost / balance.quantity * quantityInput);
  const accumulated = all ? balance.accumulatedDepreciation : money(balance.accumulatedDepreciation / balance.quantity * quantityInput);
  const netBookValue = money(cost - accumulated);
  const base = { quantity: quantityInput, cost, accumulatedDepreciation: accumulated, netBookValue };
  if (netBookValue < -0.005) return { ...base, kind: 'negative', lines: [], error: PPE_NEGATIVE_NBV_MESSAGE };
  const lines: JournalLine[] = [];
  if (accumulated > 0.005) lines.push({ accountCode: balance.item.accumulatedAccountCode, debit: accumulated, credit: 0, date });
  if (netBookValue > 0.005) lines.push({ accountCode: LOSS_ON_DISPOSAL_CODE, debit: netBookValue, credit: 0, date });
  lines.push({ accountCode: balance.item.code, debit: 0, credit: cost, date });
  return { ...base, kind: netBookValue > 0.005 ? 'positive' : 'zero', lines };
}

export function ppeRetirementWarning(plan: PpeRetirementPlan, formatCurrency: (value: number) => string): string {
  if (plan.kind === 'positive') return `This asset still has a remaining book value of ${formatCurrency(plan.netBookValue)}. If you proceed, the system will remove the original cost and accumulated depreciation attributable to the quantity being disposed of and record the remaining book value as a loss on disposal. The disposed quantity will be deducted from the available quantity.`;
  if (plan.kind === 'zero') return 'This asset is fully depreciated. If you proceed, the system will remove the original cost and accumulated depreciation attributable to the quantity being disposed of. The disposed quantity will be deducted from the available quantity.';
  return '';
}
