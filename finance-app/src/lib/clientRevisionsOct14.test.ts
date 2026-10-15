import { describe, expect, it } from 'vitest';
import { sortPrepaidItems, PREPAID_ASSET_ITEMS } from './prepaidAssets';
import { netCashLabel } from './cashFlowStatement';
import { currentSemester, newSemesterBlock } from './reportingPeriod';
import { DEFAULT_RULES, migrateRetiredAccountLines, migrateRetiredOpeningBalances, restoreSavedAccounts } from '../context/FinanceContext';

describe('Prepaid item dropdown order', () => {
  it('lists items A to Z with Others last', () => {
    const items = sortPrepaidItems(Object.keys(PREPAID_ASSET_ITEMS));
    expect(items.slice(0, 3)).toEqual(['Ballpens', 'Bamboo Sticks', 'Bondpaper']);
    expect(items[items.length - 1]).toBe('Others');
    const rest = items.slice(0, -1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });
});

describe('Net cash labels', () => {
  it('says provided for a positive amount and used for a negative one', () => {
    expect(netCashLabel('operating', 18099.98)).toBe('Net cash provided by operating activities');
    expect(netCashLabel('investing', -1050)).toBe('Net cash used by investing activities');
    expect(netCashLabel('operating', -0.01)).toBe('Net cash used by operating activities');
    expect(netCashLabel('operating', 0)).toBe('Net cash provided by operating activities');
  });
});

describe('Temporary semester restriction', () => {
  it('blocks only the semester right after the current one', () => {
    expect(newSemesterBlock('1st Semester', 2026, false, '2026-10-14')).toBe('');
    expect(newSemesterBlock('2nd Semester', 2026, false, '2026-10-14')).toContain('after 2026-12-31');
    expect(newSemesterBlock('2nd Semester', 2026, false, '2026-12-31')).toContain('after 2026-12-31');
    expect(newSemesterBlock('2nd Semester', 2026, false, '2027-01-01')).toBe('');
    expect(newSemesterBlock('1st Semester', 2027, false, '2027-05-31')).toContain('after 2027-05-31');
    expect(newSemesterBlock('1st Semester', 2027, false, '2027-08-01')).toBe('');
  });

  it('allows next school year onwards and earlier years, and always lets a saved semester be opened', () => {
    expect(newSemesterBlock('1st Semester', 2027, false, '2026-10-14')).toBe('');
    expect(newSemesterBlock('2nd Semester', 2027, false, '2026-10-14')).toBe('');
    expect(newSemesterBlock('1st Semester', 2030, false, '2026-10-14')).toBe('');
    expect(newSemesterBlock('1st Semester', 2021, false, '2026-10-14')).toBe('');
    expect(newSemesterBlock('2nd Semester', 2026, true, '2026-10-14')).toBe('');
  });

  it('looks ahead to the next 1st semester during June and July', () => {
    expect(currentSemester('2027-06-15')).toEqual({ semester: '1st Semester', reportingYear: 2027 });
    expect(currentSemester('2027-02-01')).toEqual({ semester: '2nd Semester', reportingYear: 2026 });
  });
});

describe('Accounts Receivable - Merchandise', () => {
  it('renames account 1200 in a saved Chart of Accounts', () => {
    const restored = restoreSavedAccounts([{ code: '1200', name: 'Accounts Receivable', type: 'Assets', normalBalance: 'Debit', description: 'old', isActive: true }]);
    expect(restored.find(account => account.code === '1200')?.name).toBe('Accounts Receivable - Merchandise');
  });
});

describe('Chart of Accounts cleanup (FORMAT FS - red highlights)', () => {
  const row = (code: string, name: string, type: string) => ({ code, name, type, normalBalance: 'Debit', description: '', isActive: true }) as never;

  it('drops Rent Receivable, Advances to Members/Others, Interest Income and Loss from Spoilage', () => {
    const restored = restoreSavedAccounts([row('1210', 'Rent Receivable', 'Assets'), row('1220', 'Advances to Members', 'Assets'), row('1230', 'Advances to Others', 'Assets'), row('4060', 'Interest Income', 'Revenue'), row('5170', 'Loss from Spoilage', 'Expenses'), row('1010', 'Cash on Hand', 'Assets')]);
    const codes = restored.map(account => account.code);
    ['1210', '1220', '1230', '4060', '5170'].forEach(code => expect(codes).not.toContain(code));
    expect(codes).toContain('1010');
  });

  it('moves any old postings and opening balances of those accounts to a remaining account', () => {
    const entries = migrateRetiredAccountLines([{ id: 'je-1', reference: 'JE-1', date: '2026-09-01', description: 'x', project: 'p', lines: [{ accountCode: '1010', debit: 50, credit: 0 }, { accountCode: '4060', debit: 0, credit: 50 }] } as never]);
    expect(entries[0].lines.map(line => line.accountCode)).toEqual(['1010', '4050']);
    expect(migrateRetiredOpeningBalances({ '1220': 10, '1370': 5 })).toEqual({ '1370': 15 });
  });

  it('records interest as Other Income', () => {
    const rule = DEFAULT_RULES.find(candidate => candidate.keyword === 'interest');
    expect(rule?.creditAccountCode).toBe('4050');
  });
});

describe('Chart of Accounts: accounts that are not on the client FORMAT FS list', () => {
  const row = (code: string, name: string) => ({ code, name, type: 'Assets', normalBalance: 'Debit', description: '', isActive: true }) as never;
  const retired = ['3020', '4080', '5270', '5280', '5310', '1600', '2300', '5040', '5010', '5060', '5190', '5220', '5110', '4010', '4020', '2200', '1350', '1650'];

  it('removes them from a saved Chart of Accounts', () => {
    const codes = restoreSavedAccounts(retired.map(code => row(code, 'x'))).map(account => account.code);
    retired.forEach(code => expect(codes).not.toContain(code));
  });

  it('keeps the accounts that other parts of the app still need', () => {
    const kept = ['5030', '1500', '1514', '1515', '1516', '5330', '5340', '5350', '5360', '1260', '3030', '4030', '4035', '4036'];
    const codes = restoreSavedAccounts(kept.map(code => row(code, 'x'))).map(account => account.code);
    kept.forEach(code => expect(codes).toContain(code));
  });

  it('moves old postings to the replacement account', () => {
    const entry = (code: string) => ({ id: code, reference: code, date: '2026-09-01', description: 'x', project: 'p', lines: [{ accountCode: code, debit: 10, credit: 0 }, { accountCode: '1010', debit: 0, credit: 10 }] }) as never;
    const mapped = Object.fromEntries(migrateRetiredAccountLines(retired.map(entry)).map(item => [item.id, item.lines[0].accountCode]));
    expect(mapped).toMatchObject({ '5040': '5290', '5010': '5200', '5060': '5300', '5190': '5120', '5220': '5100', '4010': '4050', '4020': '4050', '2200': '2080', '1350': '1370', '1650': '1651', '3020': '3010', '4080': '4090' });
    expect(migrateRetiredOpeningBalances({ '1350': 400, '1370': 100 })).toEqual({ '1370': 500 });
  });

  it('posts the automatic transaction types to the listed accounts', () => {
    const accountFor = (keyword: string) => DEFAULT_RULES.find(rule => rule.keyword === keyword);
    expect(accountFor('ballpen')?.debitAccountCode).toBe('5290');
    expect(accountFor('internet')?.debitAccountCode).toBe('5130');
    expect(accountFor('laptop')?.debitAccountCode).toBe('1501');
    expect(accountFor('printer')?.debitAccountCode).toBe('1503');
    expect(accountFor('salary')?.debitAccountCode).toBe('5200');
    expect(accountFor('service charge')?.debitAccountCode).toBe('5100');
    expect(DEFAULT_RULES.some(rule => ['5040', '5010', '5060', '5190', '5220', '5110', '4010', '4020', '2200', '1350', '1650'].some(code => rule.debitAccountCode === code || rule.creditAccountCode === code))).toBe(false);
  });

  it('uses the client wording for renamed accounts', () => {
    const name = (code: string) => restoreSavedAccounts([row(code, 'old')]).find(account => account.code === code)?.name;
    expect(name('4055')).toBe('Rent Revenue');
    expect(name('5120')).toBe('Awards and Prizes Expense');
    expect(name('5320')).toBe('Assistance');
    expect(name('2030')).toBe('Accounts Payable - PPE');
    expect(name('1653')).toBe('Table/Desk');
    expect(name('1504')).toBe('Uninterrupted Power System (UPS)');
    expect(name('5095')).toBe('Depreciation Expense - Furniture and Fixtures');
  });
});

describe('Loss on Disposal of PPE account', () => {
  it('is added to a saved Chart of Accounts as an expense', () => {
    const restored = restoreSavedAccounts([{ code: '1010', name: 'Cash on Hand', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true } as never]);
    expect(restored.find(account => account.code === '5370')).toMatchObject({ name: 'Loss on Disposal of PPE', type: 'Expenses', normalBalance: 'Debit' });
  });
});
