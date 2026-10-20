import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { ActivityFeeEntry } from '../components/ActivityFeeEntry';
import { FinancialStatements } from './FinancialStatements';
import { Review } from './Review';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let Page: () => ReturnType<typeof createElement> = () => createElement('div');
function Probe() { finance = useFinance(); return createElement(Page); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ');
const flat = (value: string) => value.replace(/\s+/g, ' ');

const seedHeldEvent = () => {
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.createActivityFeeRecord({ eventName: 'ABC', eventOccursThisPeriod: true, eventDate: '2026-09-10', totalExpected: 5000, collections: [{ date: '2026-09-10', amount: 5000 }], reportingPeriod: finance.settings.fiscalYear });
  });
};

describe('Activity Fee History is gone from Review', () => {
  it('Review no longer lists activity-fee events or their follow-up questions', () => {
    Page = () => createElement(Review);
    seedHeldEvent();
    const page = flat(text(renderer.root));
    expect(page).not.toContain('Activity Fee History');
    expect(page).not.toContain('additional collections this semester');
  });

  it('a held event does not block the Financial Statements or the closing entry', () => {
    Page = () => createElement(FinancialStatements);
    seedHeldEvent();
    expect(flat(text(renderer.root))).not.toContain("Statements aren't ready yet");
    expect(finance.journalEntries.some(entry => entry.description.startsWith('Closing Entries'))).toBe(true);
  });
});

describe('Activity fee caution for a future event', () => {
  const answer = (label: string) => act(() => { renderer.root.findAllByType('button').find(button => flat(text(button)).trim() === label)!.props.onClick(); });
  const collect = (amount: string) => act(() => {
    const inputs = renderer.root.findAllByType('input');
    inputs.find(input => input.props.type === 'number' && input.props.placeholder === undefined && input.props.min === undefined || input.props.type === 'number')!.props.onChange({ target: { value: amount } });
  });

  it('shows no "collections exceed" caution when the event is in a future period', () => {
    Page = () => createElement(ActivityFeeEntry, { defaultOpen: true } as never);
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => { finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never); });
    answer('No - next semester');
    collect('1000');
    expect(flat(text(renderer.root))).not.toContain('Collections exceed the required activity fees');
  });
});
