import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, INITIAL_ACCOUNTS } from '../context/FinanceContext';

const expected = [
  ['Delivery Fees/ Shipping Fees', '5150', 'Delivery Expense'],
  ['Load for Event Hosts', '5130', 'Communication Expense'],
  ['Cash Prizes given to Event Participants', '5120', 'Award and Prizes Expense'],
  ['Load Given as Prize to Event Participants', '5120', 'Award and Prizes Expense'],
  ['Printing/Bookbinding of Accomplishment Reports and Other Documents', '5140', 'Printing Expense'],
  ['Mass Offerings/Donations', '5230', 'Donations and Contributions Expense'],
  ['Purchase of Meals consumed by participants, speakers and organizers', '5080', 'Meals and Refreshments Expense'],
  ['Transportation Fare', '5050', 'Transportation Expense'],
  ['Transportation Allowance to hosts, speaker and guests', '5050', 'Transportation Expense'],
  ['Purchase/Printing of Tarpaulin, banners, brochures and other promotional materials', '5250', 'Promotional and Advertising Expense'],
  ['Honorarium/Token – Speaker, Facilitator, or Judge', '5200', 'Honoraria Expense'],
  ['Membership Fees paid to National Organization', '5210', 'Membership Expense'],
  ['Recording Session/Station ID Fees', '5260', 'Recording and Production Expense'],
  ['Printer Repairs', '5070', 'Repairs and Maintenance Expense'],
  ['Cash In/Cash Out Fees', '5100', 'Bank Charges'],
] as const;

describe('live working-paper expense dropdown', () => {
  it.each(expected)('%s maps to the stated expense account', (description, code, accountName) => {
    const rule = DEFAULT_RULES.find(candidate => candidate.description === description);
    expect(rule?.debitAccountCode).toBe(code);
    expect(INITIAL_ACCOUNTS.find(account => account.code === code)?.name).toBe(accountName);
  });

  it('uses the corrected loan transaction label', () => {
    expect(DEFAULT_RULES.filter(rule => rule.debitAccountCode === '1350').map(rule => rule.description))
      .toEqual(['Loans to Other Organization', 'Loans to Other Organization']);
  });
});
