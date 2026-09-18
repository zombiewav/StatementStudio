// Account codes treated as cash/cash-equivalents for cash-flow and
// running-balance calculations (Statement of Cash Flows, Dashboard Fund
// Balance Trend). Kept as a single shared list so both call sites stay in
// sync when a new cash-equivalent account (e.g. a bank/e-wallet account) is
// added to the Chart of Accounts.
export const CASH_ACCOUNT_CODES = ['1010', '1015'];

export function isCashAccountCode(code: string): boolean {
  return CASH_ACCOUNT_CODES.includes(code);
}
