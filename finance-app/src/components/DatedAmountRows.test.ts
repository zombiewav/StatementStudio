import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DatedAmountRows } from './DatedAmountRows';

const row = [{ id: 'row-1', date: '2026-09-28', amount: '100' }];

const renderRows = (allowMultiple: boolean): string => renderToStaticMarkup(
  React.createElement(DatedAmountRows, {
    label: allowMultiple ? 'How much was paid by the organization to the supplier?' : 'Collection of unpaid activity fees',
    rows: row,
    onChange: () => undefined,
    currencySymbol: '₱',
    defaultDate: '2026-09-28',
    addLabel: allowMultiple ? 'Add payment' : 'Add collection',
    allowMultiple,
  }),
);

describe('DatedAmountRows', () => {
  it('shows one date-and-amount pair without add or remove controls in single-transaction mode', () => {
    const html = renderRows(false);

    expect(html).toContain('type="date"');
    expect(html).toContain('type="number"');
    expect(html).not.toContain('Add collection');
    expect(html).not.toContain('Remove Collection of unpaid activity fees');
  });

  it('keeps add controls available for repeatable acquisition payments', () => {
    const html = renderRows(true);

    expect(html).toContain('Add payment');
    expect(html).toContain('Remove How much was paid by the organization to the supplier?');
  });
});
