import { describe, expect, it } from 'vitest';
import { creditCodesForPaymentMethod } from './paymentCreditAccounts';

const none = { organization: 0, officer: 0, advance: 0 };

describe('creditCodesForPaymentMethod', () => {
  it('keeps the rule default for organization funds', () => {
    expect(creditCodesForPaymentMethod('organization-funds', none, '2030', '1010')).toEqual(['1010']);
  });

  it('shows Due to Officers when an officer paid personally', () => {
    expect(creditCodesForPaymentMethod('officer-personal', { ...none, officer: 500 }, '2030', '1010')).toEqual(['2050']);
  });

  it('shows Advances to Officers for advance-funded payments', () => {
    expect(creditCodesForPaymentMethod('officer-advance', none, '2030', '1010')).toEqual(['1250']);
    expect(creditCodesForPaymentMethod('organization-advance', none, undefined, '1010')).toEqual(['1250']);
  });

  it('shows the payable account when not yet paid', () => {
    expect(creditCodesForPaymentMethod('not-yet-paid', none, '2030', '1010')).toEqual(['2030']);
    expect(creditCodesForPaymentMethod('not-yet-paid', none, undefined, '1010')).toEqual(['1010']);
  });

  it('lists only the sources with an amount for combined payments', () => {
    expect(creditCodesForPaymentMethod('combination', { organization: 100, officer: 0, advance: 50 }, '2010', '1010')).toEqual(['1010', '1250']);
    expect(creditCodesForPaymentMethod('advance-and-personal', { ...none, officer: 40 }, '2020', '1010')).toEqual(['2050']);
  });

  it('lists every possible source for a combined payment with nothing entered yet', () => {
    expect(creditCodesForPaymentMethod('combination', none, '2010', '1010')).toEqual(['1010', '2050', '1250']);
    expect(creditCodesForPaymentMethod('advance-and-personal', none, '2020', '1010')).toEqual(['1250', '2050']);
  });
});
