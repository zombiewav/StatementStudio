import { ComponentType, createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { Sidebar } from './Sidebar';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

const SidebarView = Sidebar as unknown as ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let opened: string[] = [];
function Probe() {
  finance = useFinance();
  return createElement(SidebarView, { activePage: 'dashboard', setActivePage: (page: string) => { opened.push(page); }, isOpen: false, setIsOpen: () => undefined, isCollapsed: false, setIsCollapsed: () => undefined });
}
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const nav = () => renderer.root.findAllByType('button').filter(item => item.props['data-nav'] !== undefined).map(item => ({ label: text(item).trim(), attention: item.props['data-attention'] === 'true', item }));
const KEY = '2026::1st Semester';

describe('Other Adjustments in the sidebar', () => {
  const start = () => {
    opened = [];
    act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
    act(() => { finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never); });
  };

  it('is the tab right after Review and opens the Other Adjustments page', () => {
    start();
    const labels = nav().map(entry => entry.label.replace(/\s+\d+$/, ''));
    expect(labels.indexOf('Other Adjustments')).toBe(labels.indexOf('Review') + 1);
    act(() => { nav().find(entry => entry.label.startsWith('Other Adjustments'))!.item.props.onClick(); });
    expect(opened).toEqual(['other-adjustments']);
  });

  it('is not red when the semester needs no adjustments', () => {
    start();
    expect(nav().find(entry => entry.label.startsWith('Other Adjustments'))!.attention).toBe(false);
  });

  it('turns red while adjustments are outstanding, and back to normal once they are all updated', () => {
    start();
    act(() => { finance.addJournalEntry('2026-10-01', 'capital', 'General Fund Operations', [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 1000 }]); });
    const red = nav().find(entry => entry.label.startsWith('Other Adjustments'))!;
    expect(red.attention).toBe(true);
    expect(red.item.props.className).toContain('text-rose-700');
    expect(red.label).toContain('1');
    act(() => { finance.updateSettings({ otherAdjustments: { [KEY]: { cashBankAndEwallet: 400 } } } as never); });
    const calm = nav().find(entry => entry.label.startsWith('Other Adjustments'))!;
    expect(calm.attention).toBe(false);
    expect(calm.item.props.className).not.toContain('text-rose-700');
  });
});
