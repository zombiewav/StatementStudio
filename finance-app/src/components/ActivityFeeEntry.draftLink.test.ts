import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { ActivityFeeEntry } from './ActivityFeeEntry';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(ActivityFeeEntry, { defaultOpen: true, requestedType: { value: 'receivable', nonce: 1 } }); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');

describe('Collection of Activity Fees Receivable with saved drafts', () => {
  it('lists an event that is only a saved draft, and a saved collection lowers what is left', () => {
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    expect(text(renderer.root)).toContain('No events currently have an outstanding Activity Fees Receivable balance');

    act(() => {
      finance.saveDraftTransaction({
        category: 'activity-fees', label: 'Foundation Day',
        formState: {
          transactionType: 'activity-fees', eventName: 'Foundation Day', eventOccursThisPeriod: 'yes', eventDate: '2026-10-10', totalExpected: '1000', priorPeriodCollected: '0',
          priorEventCollections: [{ id: 'a', date: '', amount: '' }], onOrAfterEventCollections: [{ id: 'b', date: '2026-10-10', amount: '400' }],
        },
      });
    });
    expect(text(renderer.root)).toContain('Foundation Day (saved draft)');
    expect(text(renderer.root)).toContain('600.00 remaining');
    expect(text(renderer.root)).not.toContain('No events currently have an outstanding');

    act(() => {
      finance.saveDraftTransaction({
        category: 'activity-fees', label: 'Activity Fees Receivable - Foundation Day',
        formState: { transactionType: 'receivable', selectedReceivableId: finance.draftTransactions.find(draft => draft.label === 'Foundation Day')!.id ? `draft:${finance.draftTransactions.find(draft => draft.label === 'Foundation Day')!.id}` : '', receivableCollection: [{ id: 'x', date: '2026-10-12', amount: '250' }] },
      });
    });
    expect(text(renderer.root)).toContain('350.00 remaining');
  });
});
