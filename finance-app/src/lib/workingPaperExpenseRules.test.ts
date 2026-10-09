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
  ['Small Printer Repairs', '5070', 'Repairs and Maintenance Expense'],
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

const ppeAssetRules = [
  ['Purchase of Laptop', '1501', 'Laptop'],
  ['Purchase of Projector', '1502', 'Projector'],
  ['Purchase of Printer', '1503', 'Printer'],
  ['Purchase of UPS (Uninterrupted Power System)', '1504', 'Uninterrupted Power System'],
  ['Purchase of Cash Box', '1505', 'Cash Box'],
  ['Purchase of HDMI', '1506', 'HDMI'],
  ['Purchase of WIFI Box', '1507', 'WIFI Box'],
  ['Purchase of Microphone', '1508', 'Microphone'],
  ['Purchase of Flash Drive', '1509', 'Flash Drive'],
  ['Purchase of Mouse', '1510', 'Mouse'],
  ['Purchase of Speaker', '1511', 'Speaker'],
  ['Purchase of Projector Stand', '1512', 'Projector Stand'],
  ['Purchase of Adaptor', '1513', 'Adaptor'],
  ['Purchase of Computer Hardware', '1514', 'Computer Hardware'],
  ['Purchase of Extension Wire', '1515', 'Extension Wire'],
  ['Purchase of Other Small Equipment', '1516', 'Small Equipment'],
  ['Purchase of Cabinet', '1651', 'Cabinet'],
  ['Purchase Chairs', '1652', 'Chairs'],
  ['Purchase of Tables/Desks', '1653', 'Tables and Desks'],
] as const;

describe('PPE purchase dropdown mappings', () => {
  it.each(ppeAssetRules)('%s debits its named asset account', (description, code, name) => {
    const rule = DEFAULT_RULES.find(candidate => candidate.description === description);
    expect(rule?.debitAccountCode).toBe(code);
    expect(INITIAL_ACCOUNTS.find(account => account.code === code)?.name).toBe(name);
  });
});
