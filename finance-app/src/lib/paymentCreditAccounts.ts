export interface EnteredPayments {
  organization: number;
  officer: number;
  advance: number;
}

const CASH = '1010';
const DUE_TO_OFFICERS = '2050';
const ADVANCES_TO_OFFICERS = '1250';

/**
 * Credit accounts a purchase will use for the chosen payment method. The journal
 * preview is empty until every amount is valid, so the read-only Credit Account
 * field uses this to show where the payment will come from (e.g. Due to Officers
 * for an officer-paid purchase) instead of the rule's default Cash on Hand.
 */
export function creditCodesForPaymentMethod(
  method: string,
  entered: EnteredPayments,
  payableCode: string | undefined,
  defaultCode: string,
): string[] {
  if (method === 'officer-personal') return [DUE_TO_OFFICERS];
  if (method === 'officer-advance' || method === 'organization-advance') return [ADVANCES_TO_OFFICERS];
  if (method === 'not-yet-paid') return [payableCode || defaultCode];
  if (method === 'combination' || method === 'advance-and-personal') {
    const codes = [
      ...(entered.organization > 0 ? [CASH] : []),
      ...(entered.officer > 0 ? [DUE_TO_OFFICERS] : []),
      ...(entered.advance > 0 ? [ADVANCES_TO_OFFICERS] : []),
    ];
    if (codes.length) return codes;
    return method === 'combination' ? [CASH, DUE_TO_OFFICERS, ADVANCES_TO_OFFICERS] : [ADVANCES_TO_OFFICERS, DUE_TO_OFFICERS];
  }
  return [defaultCode];
}
