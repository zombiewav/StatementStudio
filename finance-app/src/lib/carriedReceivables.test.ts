import { describe, expect, it } from 'vitest';
import { carriedReceivableRows } from './carriedReceivables';

const accounts = [{ code: '1200', name: 'Accounts Receivable - Merchandise' }, { code: '1320', name: 'Due from Officers' }];

describe('carried receivables', () => {
  it('lists a receivable that came in as a beginning balance and still has a balance, with what is left', () => {
    const rows = carriedReceivableRows({ '1200': 500, '1320': 200 }, { '1200': 300, '1320': 200 }, accounts);
    expect(rows.map(row => [row.code, row.name, row.balance])).toEqual([['1200', 'Accounts Receivable - Merchandise', 300], ['1320', 'Due from Officers', 200]]);
    expect(rows[0]).toMatchObject({ categoryId: 'merchandise', typeName: 'Collection of Unpaid Sold Merchandise' });
  });

  it('drops a receivable once it is collected down to zero', () => {
    expect(carriedReceivableRows({ '1200': 500 }, { '1200': 0 }, accounts)).toEqual([]);
  });

  it('ignores receivables created this semester (nothing carried in)', () => {
    expect(carriedReceivableRows({}, { '1200': 800 }, accounts)).toEqual([]);
  });
});
