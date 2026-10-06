import { describe, expect, it } from 'vitest';
import { buildPrepaidAssetConsumptionPosting, buildPrepaidAssetDownpaymentPosting, buildPrepaidAssetPurchasePosting, PREPAID_ASSET_CATEGORIES, PREPAID_ASSET_ITEMS } from './prepaidAssets';

describe('prepaid assets', () => {
  it('keeps document items mapped to their allowed categories', () => {
    expect(PREPAID_ASSET_ITEMS.Plaques).toEqual(['awards', 'supplies']);
    expect(PREPAID_ASSET_ITEMS.Wifi).toBeUndefined();
    expect(PREPAID_ASSET_ITEMS.Load).toBeUndefined();
    expect(PREPAID_ASSET_ITEMS.Uniform).toEqual(['uniform']);
  });

  it('records a mixed-source purchase and leaves the unpaid balance payable', () => {
    const posting = buildPrepaidAssetPurchasePosting({
      category: 'supplies', purchasePrice: 1000, purchaseDate: '2026-10-03', paymentMethod: 'combination',
      organizationPayments: [{ date: '', amount: 200 }], officerPayments: [{ date: '2026-10-04', amount: 100 }],
      advancePayments: [{ date: '2026-10-05', amount: 250 }], availableCash: 200, availableAdvance: 250,
    });
    expect(posting.payable).toBe(450);
    expect(posting.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '1285', debit: 1000 }),
      expect.objectContaining({ accountCode: '1010', credit: 200 }),
      expect.objectContaining({ accountCode: '2050', credit: 100 }),
      expect.objectContaining({ accountCode: '1250', credit: 250 }),
      expect.objectContaining({ accountCode: '2062', credit: 800, date: '2026-10-03' }),
      expect.objectContaining({ accountCode: '2062', debit: 100, date: '2026-10-04' }),
      expect.objectContaining({ accountCode: '2062', debit: 250, date: '2026-10-05' }),
    ]));
  });

  it('applies rent deposits, records supplier overpayments, and rejects unavailable advances', () => {
    const posting = buildPrepaidAssetPurchasePosting({ category: 'rent', purchasePrice: 500, purchaseDate: '2026-10-03', paymentMethod: 'organization-funds', organizationPayments: [{ date: '', amount: 300 }], downpaymentAmount: 200, availableCash: 300 });
    expect(posting.payable).toBe(0);
    expect(posting.lines).toContainEqual(expect.objectContaining({ accountCode: '1270', credit: 200 }));
    expect(() => buildPrepaidAssetPurchasePosting({ category: 'supplies', purchasePrice: 100, purchaseDate: '2026-10-03', paymentMethod: 'officer-advance', advancePayments: [{ date: '', amount: 100 }], availableAdvance: 50 })).toThrow(/advance balance/i);
    const overpayment = buildPrepaidAssetPurchasePosting({ category: 'awards', purchasePrice: 100, purchaseDate: '2026-10-03', paymentMethod: 'organization-funds', organizationPayments: [{ date: '', amount: 101 }], availableCash: 101 });
    expect(overpayment.receivableFromSupplier).toBe(1);
    expect(overpayment.lines).toContainEqual(expect.objectContaining({ accountCode: '1360', debit: 1, credit: 0 }));
  });

  it('uses later payments to clear the related payable before recording supplier receivable', () => {
    const posting = buildPrepaidAssetPurchasePosting({
      category: 'supplies', purchasePrice: 100, purchaseDate: '2026-10-03', paymentMethod: 'organization-funds',
      organizationPayments: [{ date: '', amount: 40 }, { date: '2026-10-04', amount: 70 }], availableCash: 110,
    });
    expect(posting.payable).toBe(0);
    expect(posting.receivableFromSupplier).toBe(10);
    expect(posting.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '2062', debit: 60, credit: 0, date: '2026-10-04' }),
      expect.objectContaining({ accountCode: '1360', debit: 10, credit: 0, date: '2026-10-04' }),
      expect.objectContaining({ accountCode: '1010', debit: 0, credit: 70, date: '2026-10-04' }),
    ]));
  });

  it('posts deposits and consumption to the category-specific accounts', () => {
    expect(buildPrepaidAssetDownpaymentPosting('uniform', 100, '2026-10-03')).toEqual([
      { accountCode: '1270', debit: 100, credit: 0, date: '2026-10-03' },
      { accountCode: '1010', debit: 0, credit: 100, date: '2026-10-03' },
    ]);
    expect(buildPrepaidAssetConsumptionPosting('awards', 75, '2026-10-04')).toEqual([
      { accountCode: '5120', debit: 75, credit: 0, date: '2026-10-04' },
      { accountCode: '1280', debit: 0, credit: 75, date: '2026-10-04' },
    ]);
  });

  it('uses Advances to Suppliers for both allowed downpayment categories', () => {
    expect(PREPAID_ASSET_CATEGORIES.rent.depositCode).toBe('1270');
    expect(PREPAID_ASSET_CATEGORIES.uniform.depositCode).toBe('1270');
  });
});
