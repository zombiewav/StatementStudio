import { describe, expect, it } from 'vitest';
import { buildPrepaidAssetConsumptionPosting, buildPrepaidAssetDownpaymentPosting, buildPrepaidAssetPurchasePosting, PREPAID_ASSET_ITEMS } from './prepaidAssets';

describe('prepaid assets', () => {
  it('keeps document items mapped to their allowed categories', () => {
    expect(PREPAID_ASSET_ITEMS.Plaques).toEqual(['awards', 'supplies']);
    expect(PREPAID_ASSET_ITEMS.Wifi).toEqual(['wifi']);
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
      expect.objectContaining({ accountCode: '2060', credit: 450 }),
    ]));
  });

  it('applies rent deposits and rejects overpayment or unavailable advances', () => {
    const posting = buildPrepaidAssetPurchasePosting({ category: 'rent', purchasePrice: 500, purchaseDate: '2026-10-03', paymentMethod: 'organization-funds', organizationPayments: [{ date: '', amount: 300 }], downpaymentAmount: 200, availableCash: 300 });
    expect(posting.payable).toBe(0);
    expect(posting.lines).toContainEqual(expect.objectContaining({ accountCode: '1340', credit: 200 }));
    expect(() => buildPrepaidAssetPurchasePosting({ category: 'wifi', purchasePrice: 100, purchaseDate: '2026-10-03', paymentMethod: 'officer-advance', advancePayments: [{ date: '', amount: 100 }], availableAdvance: 50 })).toThrow(/advance balance/i);
    expect(() => buildPrepaidAssetPurchasePosting({ category: 'awards', purchasePrice: 100, purchaseDate: '2026-10-03', paymentMethod: 'organization-funds', organizationPayments: [{ date: '', amount: 101 }], availableCash: 101 })).toThrow(/cannot exceed/i);
  });

  it('posts deposits and consumption to the category-specific accounts', () => {
    expect(buildPrepaidAssetDownpaymentPosting('uniform', 100, '2026-10-03')).toEqual([
      { accountCode: '1345', debit: 100, credit: 0, date: '2026-10-03' },
      { accountCode: '1010', debit: 0, credit: 100, date: '2026-10-03' },
    ]);
    expect(buildPrepaidAssetConsumptionPosting('awards', 75, '2026-10-04')).toEqual([
      { accountCode: '5120', debit: 75, credit: 0, date: '2026-10-04' },
      { accountCode: '1280', debit: 0, credit: 75, date: '2026-10-04' },
    ]);
  });
});
