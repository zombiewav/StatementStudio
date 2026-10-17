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

describe('Transactions category picker', () => {
  it('scrolls down to the transaction type list / form once a category is chosen', () => {
    const scrollIntoView = vi.fn();
    vi.stubGlobal('window', { requestAnimationFrame: (callback: () => void) => callback() });
    act(() => {
      renderer = create(
        createElement(FinanceProvider, null, createElement(TransactionsPage, { onDraftSaved: () => undefined, onDraftPosted: () => undefined })),
        { createNodeMock: () => ({ scrollIntoView, focus: () => undefined }) },
      );
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
    const category = renderer.root.findAllByType('button').find(button => text(button).includes('Merchandise Transactions'))!;
    act(() => { category.props.onClick(); });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
