import { ComponentType, createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider } from '../context/FinanceContext';
import { Transactions } from './Transactions';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const TransactionsPage = Transactions as unknown as ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer;
afterEach(() => { vi.unstubAllGlobals(); if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const mount = () => {
  vi.stubGlobal('window', { requestAnimationFrame: (callback: () => void) => callback() });
  act(() => {
    renderer = create(
      createElement(FinanceProvider, null, createElement(TransactionsPage, { onDraftSaved: () => undefined, onDraftPosted: () => undefined })),
      { createNodeMock: () => ({ scrollIntoView: () => undefined, focus: () => undefined }) },
    );
  });
};
const button = (label: string) => renderer.root.findAllByType('button').find(item => text(item).includes(label))!;

describe('Event/Program Expenses category', () => {
  it('has no Transaction Type dropdown: the type is chosen automatically', () => {
    mount();
    act(() => { button('Event/Program Expenses').props.onClick(); });
    const shown = text(renderer.root);
    expect(shown).not.toContain('Search a transaction type');
    expect(shown).not.toContain('Transaction Type');
    expect(shown).toContain('Amount');
    expect(shown).toContain('Date');
    expect(shown).not.toContain('Seminar / Conference Attendance Fee');
  });
});

describe('Search all transaction types', () => {
  it('sits above "Choose a transaction category"', () => {
    mount();
    const shown = text(renderer.root);
    expect(shown.indexOf('Search all transaction types')).toBeGreaterThanOrEqual(0);
    expect(shown.indexOf('Search all transaction types')).toBeLessThan(shown.indexOf('Choose a transaction category'));
  });

  it('finds a dropdown choice and opens its category with the type selected', () => {
    mount();
    const input = renderer.root.findByProps({ id: 'transaction-type-search' });
    act(() => { input.props.onChange({ target: { value: 'collections from suppliers' } }); });
    const result = renderer.root.findAll(node => node.props.role === 'option').find(option => text(option).includes('Collections from Suppliers - Merchandise'))!;
    expect(result).toBeDefined();
    act(() => { result.props.onClick(); });
    const typeInput = renderer.root.findAllByType('input').find(item => item.props.placeholder === 'Search a transaction type...')!;
    expect(typeInput.props.value).toBe('Collections from Suppliers - Merchandise');
    expect(text(renderer.root)).toContain('Outstanding receivable');
  });
});

describe('Final revisions (Oct 2026)', () => {
  const noteText = 'Save this transaction as a draft and do not post it yet until all collections and payments made within the reporting period have been updated.';

  it('lists Membership Fees first, then Activity Fees', () => {
    mount();
    const shown = text(renderer.root);
    expect(shown.indexOf('Membership Fees Current')).toBeGreaterThan(0);
    expect(shown.indexOf('Membership Fees Current')).toBeLessThan(shown.indexOf('Activity Fees Collections'));
    expect(shown.indexOf('Activity Fees Collections')).toBeLessThan(shown.indexOf('Merchandise Transactions Buy'));
  });

  it('shows the new note between the account boxes and Save as Draft, not under the type field', () => {
    mount();
    act(() => { button('Miscellaneous Transactions').props.onClick(); });
    const shown = text(renderer.root);
    expect(shown.split(noteText).length - 1).toBe(1);
    expect(shown.indexOf('Credit Account')).toBeLessThan(shown.indexOf(noteText));
    expect(shown.indexOf(noteText)).toBeLessThan(shown.indexOf('Save as Draft'));
    expect(shown).not.toContain('If information is not yet complete');
  });

  it('Activity Fees asks "Yes - current semester" / "No - next semester"', () => {
    mount();
    act(() => { button('Activity Fees').props.onClick(); });
    const shown = text(renderer.root);
    expect(shown).toContain('Yes - current semester');
    expect(shown).toContain('No - next semester');
    expect(shown.split(noteText).length - 1).toBe(1);
  });
});
