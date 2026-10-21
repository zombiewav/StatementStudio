import { describe, expect, it } from 'vitest';
import { checkGuidedPurchaseDates, LATER_PAYMENT_SAME_DATE, PAYMENT_BEFORE_TRANSACTION, PAYMENT_DATE_REQUIRED, TRANSACTION_DATE_REQUIRED } from './guidedPurchaseDates';

const row = (date: string, amount: string | number) => ({ date, amount });
const clean = { required: '', order: '' };

describe('checkGuidedPurchaseDates', () => {
  it('requires the transaction date and the date of every payment that has an amount', () => {
    expect(checkGuidedPurchaseDates('', [[row('2026-10-05', '100')]]).required).toBe(TRANSACTION_DATE_REQUIRED);
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('', '100')]]).required).toBe(PAYMENT_DATE_REQUIRED);
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-05', '100'), row('', '')]])).toEqual(clean);
    expect(checkGuidedPurchaseDates('2026-10-05', [])).toEqual(clean);
  });

  it('lets Payment 1 share the transaction date (paid on the same day)', () => {
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-05', '100'), row('2026-10-12', '50')]])).toEqual(clean);
  });

  it('lets Payment 1 come later when the payment is made at a later date', () => {
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-09', '100'), row('2026-10-12', '50'), row('2026-10-20', '25')]])).toEqual(clean);
  });

  it('refuses a payment dated before the transaction', () => {
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-04', '100')]]).order).toBe(PAYMENT_BEFORE_TRANSACTION);
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-05', '100'), row('2026-10-01', '10')]]).order).toBe(PAYMENT_BEFORE_TRANSACTION);
  });

  it('refuses Payment 2 and later on the transaction date', () => {
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-08', '100'), row('2026-10-05', '50')]]).order).toBe(LATER_PAYMENT_SAME_DATE);
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('', ''), row('2026-10-05', '50')]]).order).toBe('');
  });

  it('checks every source of payment separately, counting only rows with an amount', () => {
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-05', '40')], [row('2026-10-05', '60')]])).toEqual(clean);
    expect(checkGuidedPurchaseDates('2026-10-05', [[row('2026-10-05', '40')], [row('2026-10-05', '0'), row('2026-10-05', '60')]])).toEqual(clean);
  });
});
