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

/**
 * One Item Reference: a purchase group of the same item at the same amount per unit. References are for
 * internal tracking only; the ledger and the financial statements keep using the official accounts.
 */
export interface PpeReference {
  referenceId: string;
  item: PpeItem;
  quantity: number;
  unitCost: number;
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
export const ppeItemForRetirement = (code: string | undefined) => PPE_ITEMS.find(item => item.code === code);
export const newPpeReferenceId = () => `ppe-ref-${crypto.randomUUID()}`;

interface MutableReference { referenceId: string; item: PpeItem; quantity: number; unitCost: number; cost: number; accumulated: number }

/**
 * Every Item Reference still held. A purchase belongs to the reference named in its `ppeReferenceId` (set when it
 * was saved: an existing matching reference, or a new one); older purchases are one reference each, with the unit
 * cost worked out as cost / quantity. Depreciation and retirement entries name the reference they act on; older
 * depreciation without one is charged to that item's oldest reference. An opening balance with no carried detail
 * becomes one reference of a single unit so it can still be depreciated.
 */
export function buildPpeReferences(entries: JournalEntry[], openingBalances: Record<string, number> = {}): PpeReference[] {
  const references = new Map<string, MutableReference>();
  const carriedCost = new Map<string, number>();
  const firstFor = (item: PpeItem) => [...references.values()].find(reference => reference.item.code === item.code && reference.quantity > 0);
  const pendingDepreciation = new Map<string, number>();

  entries.filter(active).forEach(entry => {
    const details = entry.transactionDetails;
    if (details?.carriedForward && details.ppeItemCode) {
      const item = ppeItemForRetirement(details.ppeItemCode);
      if (!item) return;
      const quantity = details.ppeQuantity || 0;
      const cost = details.ppeCarriedCost || 0;
      references.set(details.ppeReferenceId || `carried-${entry.id}`, {
        referenceId: details.ppeReferenceId || `carried-${entry.id}`, item, quantity, cost,
        unitCost: details.ppeUnitCost ?? (quantity ? money(cost / quantity) : 0), accumulated: details.ppeCarriedAccumulated || 0,
      });
      carriedCost.set(item.code, (carriedCost.get(item.code) || 0) + cost);
      return;
    }
    if (entry.lines.length === 0) return;
    const type = entry.transactionType ?? entry.description;

    if (type === RETIREMENT_TYPE) {
      const item = ppeItemForRetirement(details?.ppeItemCode);
      const reference = details?.ppeReferenceId ? references.get(details.ppeReferenceId) : item ? firstFor(item) : undefined;
      if (!reference) return;
      reference.quantity -= details?.ppeRetiredQuantity || 0;
      reference.cost -= details?.ppeRetiredCost || 0;
      reference.accumulated -= details?.ppeRetiredAccumulated || 0;
      return;
    }

    const purchased = ppeItemForPurchase(type);
    if (purchased) {
      const cost = lineTotal(entry, purchased.code, 'debit');
      if (cost <= 0) return;
      const quantity = details?.ppeQuantity || 1;
      const referenceId = details?.ppeReferenceId || entry.id;
      const existing = references.get(referenceId);
      if (existing) { existing.quantity += quantity; existing.cost += cost; return; }
      references.set(referenceId, { referenceId, item: purchased, quantity, cost, unitCost: details?.ppeUnitCost ?? money(cost / quantity), accumulated: 0 });
      return;
    }

    const depreciated = ppeItemForDepreciation(type);
    if (depreciated) {
      const amount = lineTotal(entry, depreciated.depreciationExpenseCode, 'debit');
      const reference = details?.ppeReferenceId ? references.get(details.ppeReferenceId) : firstFor(depreciated);
      if (reference) reference.accumulated += amount;
      else pendingDepreciation.set(depreciated.code, (pendingDepreciation.get(depreciated.code) || 0) + amount);
    }
  });

  PPE_ITEMS.forEach(item => {
    const untracked = money((openingBalances[item.code] || 0) - (carriedCost.get(item.code) || 0));
    if (untracked > 0.005) references.set(`ppe-opening-${item.code}`, { referenceId: `ppe-opening-${item.code}`, item, quantity: 1, unitCost: untracked, cost: untracked, accumulated: 0 });
    const pending = pendingDepreciation.get(item.code);
    const first = pending ? firstFor(item) : undefined;
    if (pending && first) first.accumulated += pending;
  });

  return [...references.values()]
    .filter(reference => reference.cost > 0.005 && reference.quantity > 0)
    .map(reference => ({
      referenceId: reference.referenceId, item: reference.item, quantity: reference.quantity, unitCost: money(reference.unitCost),
      cost: money(reference.cost), accumulatedDepreciation: money(reference.accumulated),
      netBookValue: money(Math.max(0, reference.cost - reference.accumulated)),
    }));
}

/** An existing reference a new purchase joins: same item and amount per unit, and no depreciation yet. */
export function findMatchingPpeReference(references: PpeReference[], itemCode: string, unitCost: number): PpeReference | undefined {
  return references.find(reference => reference.item.code === itemCode
    && Math.abs(reference.unitCost - unitCost) < 0.005 && reference.accumulatedDepreciation < 0.005);
}

/** Zero-line entries that carry each held reference (quantity, unit cost, cost, depreciation) into a new semester. */
export function carryForwardPpeItems(entries: JournalEntry[], openingBalances: Record<string, number>, date: string): JournalEntry[] {
  return buildPpeReferences(entries, openingBalances).map(reference => ({
    id: `je-ppe-carried-${reference.referenceId}-${date}`,
    reference: 'B/F',
    date,
    description: `Beginning Balances — PPE detail: ${reference.item.label}`,
    project: 'General Fund Operations',
    lines: [],
    transactionType: 'Beginning Balances',
    transactionDetails: {
      eventRelated: false, receiptAttachmentIds: [], carriedForward: true,
      ppeItemCode: reference.item.code, ppeReferenceId: reference.referenceId, ppeQuantity: reference.quantity, ppeUnitCost: reference.unitCost,
      ppeCarriedCost: reference.cost, ppeCarriedAccumulated: reference.accumulatedDepreciation,
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
 * Retiring part or all of one Item Reference. Cost to dispose = amount per unit x quantity;
 * accumulated depreciation to dispose = the reference's depreciation / available quantity x quantity.
 * Disposing every remaining unit takes the exact remaining amounts (no rounding leftovers).
 * Net Book Value above zero is written off as a loss; zero needs no loss; negative is refused outright.
 */
export function planPpeRetirement(reference: PpeReference, quantityInput: number, date: string): PpeRetirementPlan {
  const empty = { quantity: 0, cost: 0, accumulatedDepreciation: 0, netBookValue: 0, lines: [] as JournalLine[] };
  if (!Number.isInteger(quantityInput) || quantityInput <= 0) return { ...empty, error: 'Enter the quantity to be disposed: a whole number greater than zero.' };
  if (quantityInput > reference.quantity) return { ...empty, error: `The quantity to be disposed cannot exceed the available quantity of ${reference.quantity}.` };
  const all = quantityInput === reference.quantity;
  const cost = all ? reference.cost : money(reference.unitCost * quantityInput);
  const accumulated = all ? reference.accumulatedDepreciation : money(reference.accumulatedDepreciation / reference.quantity * quantityInput);
  const netBookValue = money(cost - accumulated);
  const base = { quantity: quantityInput, cost, accumulatedDepreciation: accumulated, netBookValue };
  if (netBookValue < -0.005) return { ...base, kind: 'negative', lines: [], error: PPE_NEGATIVE_NBV_MESSAGE };
  const lines: JournalLine[] = [];
  if (accumulated > 0.005) lines.push({ accountCode: reference.item.accumulatedAccountCode, debit: accumulated, credit: 0, date });
  if (netBookValue > 0.005) lines.push({ accountCode: LOSS_ON_DISPOSAL_CODE, debit: netBookValue, credit: 0, date });
  lines.push({ accountCode: reference.item.code, debit: 0, credit: cost, date });
  return { ...base, kind: netBookValue > 0.005 ? 'positive' : 'zero', lines };
}

export function ppeRetirementWarning(plan: PpeRetirementPlan, formatCurrency: (value: number) => string): string {
  if (plan.kind === 'positive') return `This asset still has a remaining book value of ${formatCurrency(plan.netBookValue)}. If you proceed, the system will remove the original cost and accumulated depreciation attributable to the quantity being disposed of and record the remaining book value as a loss on disposal. The disposed quantity will be deducted from the available quantity.`;
  if (plan.kind === 'zero') return 'This asset is fully depreciated. If you proceed, the system will remove the original cost and accumulated depreciation attributable to the quantity being disposed of. The disposed quantity will be deducted from the available quantity.';
  return '';
}

/** A short description that tells two references of the same item apart. */
export const describePpeReference = (reference: PpeReference, formatCurrency: (value: number) => string): string =>
  `${reference.quantity} available · ${formatCurrency(reference.unitCost)} per unit · remaining cost ${formatCurrency(reference.cost)}`;
