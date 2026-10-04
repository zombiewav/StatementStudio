import { DatedAmountRecord, JournalLine } from '../types';

export type PrepaidAssetCategory = 'awards' | 'supplies' | 'wifi' | 'rent' | 'uniform';
export type PrepaidAssetPaymentMethod = 'organization-funds' | 'officer-personal' | 'officer-advance' | 'combination' | 'not-yet-paid';

interface PrepaidAssetCategoryConfig { label: string; assetCode: string; expenseCode: string; depositCode?: string }

export const PREPAID_ASSET_CATEGORIES: Record<PrepaidAssetCategory, PrepaidAssetCategoryConfig> = {
  awards: { label: 'Awards and Prizes', assetCode: '1280', expenseCode: '5120' },
  supplies: { label: 'Supplies and Materials', assetCode: '1285', expenseCode: '5290' },
  wifi: { label: 'Prepaid Wifi', assetCode: '1290', expenseCode: '5030' },
  rent: { label: 'Prepaid Rent', assetCode: '1295', expenseCode: '5020', depositCode: '1340' },
  uniform: { label: 'Clothing/Uniform', assetCode: '1298', expenseCode: '5180', depositCode: '1345' },
} as const;

export const PREPAID_ASSET_ACCOUNT_CODES: string[] = Object.values(PREPAID_ASSET_CATEGORIES).map(category => category.assetCode);

const sharedItems = ['Plaques', 'Certificates', 'Medals', 'Trophies', 'Pins', 'Bondpaper', 'Printed Programs', 'Ballpens', 'Markers', 'Folder', 'Envelopes', 'Name Tags', 'Clipboards', 'Staplers', 'Staples', 'Scissors', 'Tape', 'Glue', 'Ribbon', 'Cutting Materials', 'Sticky Notes', 'Cloth', 'Bamboo Sticks', 'Metallic Foil'];

export const PREPAID_ASSET_ITEMS: Record<string, PrepaidAssetCategory[]> = {
  ...Object.fromEntries(sharedItems.map(item => [item, ['awards', 'supplies'] as PrepaidAssetCategory[]])),
  'Other Prizes and Awards': ['awards'],
  'Other Materials and Supplies': ['supplies'],
  'Decoration Materials': ['supplies'],
  'Booth Materials': ['supplies'],
  'First Aid Kit': ['supplies'],
  Wifi: ['wifi'],
  Load: ['wifi'],
  'Projector Rental': ['rent'],
  'Chairs and Tables Rental': ['rent'],
  'Booth Rental': ['rent'],
  'Tent Rental': ['rent'],
  'Microphone Rental': ['rent'],
  'Light and Sound System Rental': ['rent'],
  Uniform: ['uniform'],
  Clothing: ['uniform'],
};

const cents = (value: number) => Math.round(value * 100) / 100;
const total = (rows: DatedAmountRecord[]) => cents(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));

export interface PrepaidAssetPurchaseInput {
  category: PrepaidAssetCategory;
  purchasePrice: number;
  purchaseDate: string;
  paymentMethod: PrepaidAssetPaymentMethod;
  organizationPayments?: DatedAmountRecord[];
  officerPayments?: DatedAmountRecord[];
  advancePayments?: DatedAmountRecord[];
  downpaymentAmount?: number;
  availableCash?: number;
  availableAdvance?: number;
}

export function buildPrepaidAssetPurchasePosting(input: PrepaidAssetPurchaseInput): { lines: JournalLine[]; payable: number; receivableFromSupplier: number; paid: number } {
  const config = PREPAID_ASSET_CATEGORIES[input.category];
  const price = cents(Number(input.purchasePrice));
  if (price <= 0) throw new Error('Purchase price must be greater than zero.');

  const organization = input.paymentMethod === 'organization-funds' || input.paymentMethod === 'combination' ? input.organizationPayments || [] : [];
  const officer = input.paymentMethod === 'officer-personal' || input.paymentMethod === 'combination' ? input.officerPayments || [] : [];
  const advance = input.paymentMethod === 'officer-advance' || input.paymentMethod === 'combination' ? input.advancePayments || [] : [];
  const organizationTotal = total(organization);
  const officerTotal = total(officer);
  const advanceTotal = total(advance);
  const downpayment = cents(Number(input.downpaymentAmount || 0));
  const paid = cents(organizationTotal + officerTotal + advanceTotal + downpayment);

  if (organizationTotal > cents(Number(input.availableCash ?? Number.POSITIVE_INFINITY))) throw new Error('Organization cash payments cannot exceed the available cash balance.');
  if (advanceTotal > cents(Number(input.availableAdvance || 0))) throw new Error('Payments through an officer advance cannot exceed that officer’s available advance balance.');
  if (downpayment > 0 && !config.depositCode) throw new Error('Recorded downpayments are only available for Prepaid Rent and Clothing/Uniform.');

  const datedSources = [
    { rows: organization, accountCode: '1010' },
    { rows: officer, accountCode: '2050' },
    { rows: advance, accountCode: '1250' },
  ].map(source => ({
    ...source,
    rows: source.rows.filter(row => Number(row.amount) > 0).map(row => ({ ...row, date: row.date || input.purchaseDate, amount: cents(Number(row.amount)) })),
  }));
  const addCreditLines = (lines: JournalLine[], sources: typeof datedSources, date: string) => {
    sources.forEach(source => source.rows.filter(row => row.date === date).forEach(row => lines.push({ accountCode: source.accountCode, debit: 0, credit: row.amount, date })));
  };
  const paymentOn = (date: string) => cents(datedSources.reduce((sum, source) => sum + total(source.rows.filter(row => row.date === date)), 0));

  const lines: JournalLine[] = [{ accountCode: config.assetCode, debit: price, credit: 0, date: input.purchaseDate }];
  const initialPaid = cents(paymentOn(input.purchaseDate) + downpayment);
  let remainingPayable = Math.max(0, cents(price - initialPaid));
  let receivableFromSupplier = Math.max(0, cents(initialPaid - price));
  if (downpayment > 0 && config.depositCode) lines.push({ accountCode: config.depositCode, debit: 0, credit: downpayment, date: input.purchaseDate });
  addCreditLines(lines, datedSources, input.purchaseDate);
  if (remainingPayable > 0) lines.push({ accountCode: '2060', debit: 0, credit: remainingPayable, date: input.purchaseDate });
  if (receivableFromSupplier > 0) lines.push({ accountCode: '1360', debit: receivableFromSupplier, credit: 0, date: input.purchaseDate });

  [...new Set(datedSources.flatMap(source => source.rows.map(row => row.date)).filter(date => date !== input.purchaseDate))].sort().forEach(date => {
    const payment = paymentOn(date);
    const payableSettlement = Math.min(remainingPayable, payment);
    const excess = cents(payment - payableSettlement);
    if (payableSettlement > 0) lines.push({ accountCode: '2060', debit: payableSettlement, credit: 0, date });
    if (excess > 0) {
      lines.push({ accountCode: '1360', debit: excess, credit: 0, date });
      receivableFromSupplier = cents(receivableFromSupplier + excess);
    }
    addCreditLines(lines, datedSources, date);
    remainingPayable = cents(remainingPayable - payableSettlement);
  });

  return { lines, payable: remainingPayable, receivableFromSupplier, paid };
}

export function buildPrepaidAssetDownpaymentPosting(category: PrepaidAssetCategory, amount: number, date: string): JournalLine[] {
  const config = PREPAID_ASSET_CATEGORIES[category];
  const value = cents(Number(amount));
  if (!config.depositCode) throw new Error('Downpayments are only available for Prepaid Rent and Clothing/Uniform.');
  if (value <= 0) throw new Error('Downpayment must be greater than zero.');
  return [
    { accountCode: config.depositCode, debit: value, credit: 0, date },
    { accountCode: '1010', debit: 0, credit: value, date },
  ];
}

export function buildPrepaidAssetConsumptionPosting(category: PrepaidAssetCategory, amount: number, date: string): JournalLine[] {
  const config = PREPAID_ASSET_CATEGORIES[category];
  const value = cents(Number(amount));
  if (value <= 0) throw new Error('Consumption amount must be greater than zero.');
  return [
    { accountCode: config.expenseCode, debit: value, credit: 0, date },
    { accountCode: config.assetCode, debit: 0, credit: value, date },
  ];
}
