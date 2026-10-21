import { describe, expect, it } from 'vitest';
import { advanceCaution, ADVANCE_NO_RECORD_CAUTION, MERCHANDISE_EXCESS_CAUTION, MERCHANDISE_PAYMENT_WINDOW_CAUTION, MERCHANDISE_SHORTFALL_CAUTION, MERCHANDISE_TOTAL_COST_REMINDER, guidedPaymentCautions, OFFICER_REIMBURSEMENT_NOTE, paymentExceedsCaution, paymentShortfallCaution } from './paymentCautions';

const base = { method: 'organization-funds' as const, amount: 1000, organizationTotal: 0, officerTotal: 0, advanceTotal: 0, advanceBalance: 0 };

describe('payment cautions wording', () => {
  it('uses the expense wording for expenses and the asset wording for PPE', () => {
    expect(paymentShortfallCaution('expense')).toBe('⚠️ Caution: The total amount paid is less than the expense amount. The unpaid portion will be recorded as a payable. If the remaining amount is paid later within the current reporting period, you may update this transaction in the Review section.');
    expect(paymentShortfallCaution('asset')).toContain('less than the Purchase Price of Asset.');
    expect(paymentExceedsCaution('expense')).toBe('⚠️ Caution: Total Payment cannot exceed expense amount');
    expect(paymentExceedsCaution('asset')).toBe('⚠️ Caution: Total Payment cannot exceed Purchase Price of Asset');
    expect(OFFICER_REIMBURSEMENT_NOTE).toBe('Note: Any reimbursement to the officer should be recorded separately under the Reimbursement category.');
  });
});

describe('guidedPaymentCautions', () => {
  it('warns about a shortfall only when payments are below the amount', () => {
    expect(guidedPaymentCautions({ ...base, organizationTotal: 400 })).toMatchObject({ shortfall: true, exceeds: false });
    expect(guidedPaymentCautions({ ...base, organizationTotal: 1000 })).toMatchObject({ shortfall: false, exceeds: false });
  });

  it('warns when payments exceed the amount', () => {
    expect(guidedPaymentCautions({ ...base, organizationTotal: 1500 })).toMatchObject({ shortfall: false, exceeds: true });
  });

  it('shows no shortfall caution for "not yet paid" or before an amount is entered', () => {
    expect(guidedPaymentCautions({ ...base, method: 'not-yet-paid' }).shortfall).toBe(false);
    expect(guidedPaymentCautions({ ...base, amount: 0 })).toMatchObject({ shortfall: false, exceeds: false });
  });

  it('counts only the amounts that belong to the chosen method', () => {
    expect(guidedPaymentCautions({ ...base, method: 'officer-personal', organizationTotal: 5000, officerTotal: 1000 })).toMatchObject({ shortfall: false, exceeds: false });
  });

  it('adds up all three sources for a combination', () => {
    expect(guidedPaymentCautions({ ...base, method: 'combination', organizationTotal: 400, officerTotal: 400, advanceTotal: 400 }).exceeds).toBe(true);
    expect(guidedPaymentCautions({ ...base, method: 'combination', organizationTotal: 300, officerTotal: 300, advanceTotal: 300 }).shortfall).toBe(true);
  });

  it('shows the reimbursement note for officer money only', () => {
    expect(guidedPaymentCautions({ ...base, method: 'officer-personal' }).reimbursementNote).toBe(true);
    expect(guidedPaymentCautions({ ...base, method: 'combination', officerTotal: 0 }).reimbursementNote).toBe(false);
    expect(guidedPaymentCautions({ ...base, method: 'combination', officerTotal: 200 }).reimbursementNote).toBe(true);
    expect(guidedPaymentCautions({ ...base, method: 'organization-funds' }).reimbursementNote).toBe(false);
    expect(guidedPaymentCautions({ ...base, method: 'officer-advance' }).reimbursementNote).toBe(false);
  });
});

describe('advance payment cautions', () => {
  const advance = { ...base, method: 'officer-advance' as const, advanceBalance: 600 };

  it('uses the sheet wording', () => {
    expect(advanceCaution('asset', 'amount-and-advance')).toBe('⚠️ Caution: Payment cannot exceed Purchase Price of Asset and Advances made to the officer.');
    expect(advanceCaution('expense', 'amount')).toBe('⚠️ Caution: Payment cannot exceed expense amount');
    expect(advanceCaution('expense', 'advance')).toBe('⚠️ Caution: Payment through advances by officer cannot exceed advances made to the officer.');
    expect(ADVANCE_NO_RECORD_CAUTION).toContain('No record of an accountable officer found.');
    expect(ADVANCE_NO_RECORD_CAUTION).toContain('under Advances to Officers Category');
  });

  it('flags payments over both the amount and the advance', () => {
    expect(guidedPaymentCautions({ ...advance, advanceTotal: 1500 })).toMatchObject({ advanceIssue: 'amount-and-advance', exceeds: false });
  });

  it('flags payments over the amount only', () => {
    expect(guidedPaymentCautions({ ...advance, advanceBalance: 5000, advanceTotal: 1500 })).toMatchObject({ advanceIssue: 'amount', exceeds: false });
  });

  it('flags payments over the advance only', () => {
    expect(guidedPaymentCautions({ ...advance, advanceTotal: 800 })).toMatchObject({ advanceIssue: 'advance', shortfall: true });
  });

  it('has no advance issue within both limits', () => {
    expect(guidedPaymentCautions({ ...advance, advanceTotal: 600 }).advanceIssue).toBeNull();
  });

  it('keeps the general caution for a combination and adds the advance one', () => {
    const result = guidedPaymentCautions({ ...base, method: 'combination', organizationTotal: 500, officerTotal: 300, advanceTotal: 700, advanceBalance: 600 });
    expect(result).toMatchObject({ exceeds: true, advanceIssue: 'advance' });
  });
});

describe('merchandise acquisition cautions', () => {
  it('uses the wording from the acquisition document', () => {
    expect(MERCHANDISE_PAYMENT_WINDOW_CAUTION).toBe('Caution: Record only payments made on or after the date the merchandise was received and is already on hand. Exclude downpayments made before receipt.');
    expect(MERCHANDISE_TOTAL_COST_REMINDER).toBe('Enter the total amount spent to purchase and prepare the merchandise for sale. Include not only the purchase price but also other direct costs, such as design fees and labor costs for making the merchandise.');
    expect(MERCHANDISE_SHORTFALL_CAUTION).toContain('less than the Total Cost of the Batch.');
    expect(MERCHANDISE_EXCESS_CAUTION).toBe('⚠️ Caution: Total Payment exceeded the Total Cost of this batch. The excess payment will be recorded under Accounts Receivable – Supplier. If any excess payment has been refunded, please select “Collection of Refund from Supplier for Excess Payment” from the dropdown and enter the amount of the refund collected.');
  });
});
