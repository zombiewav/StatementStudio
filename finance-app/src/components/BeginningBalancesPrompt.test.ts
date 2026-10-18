import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { BeginningBalancesPrompt } from './BeginningBalancesPrompt';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
function Probe() { finance = useFinance(); return createElement(BeginningBalancesPrompt); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const mount = () => { act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); }); };
const dialog = () => renderer.root.findAll(node => node.props.role === 'dialog');
const button = (label: string) => renderer.root.findAllByType('button').find(item => text(item).includes(label))!;

describe('Beginning Balances first-sign-in dialog', () => {
  it('shows for a brand-new organization and explains it appears only once', () => {
    mount();
    expect(dialog().length).toBeGreaterThan(0);
    expect(text(renderer.root)).toContain('Set up your Beginning Balances');
    expect(text(renderer.root)).toContain('only the first time');
    expect(finance.settings.beginningBalancesPrompted).toBeFalsy();
  });

  it('skipping closes it and remembers the answer', () => {
    mount();
    act(() => { button('Skip for now').props.onClick(); });
    expect(dialog().length).toBe(0);
    expect(finance.settings.beginningBalancesPrompted).toBe(true);
  });

  it('posting a balance records one entry, remembers the answer, and keeps the dialog open until Continue', () => {
    mount();
    const cash = renderer.root.findAllByType('input')[0];
    act(() => { cash.props.onChange({ target: { value: '2500' } }); });
    act(() => { renderer.root.findByType('form').props.onSubmit({ preventDefault: () => undefined }); });
    expect(finance.journalEntries.filter(entry => entry.description === 'Beginning Balances')).toHaveLength(1);
    expect(finance.settings.beginningBalancesPrompted).toBe(true);
    expect(dialog().length).toBeGreaterThan(0);
    act(() => { button('Continue to the dashboard').props.onClick(); });
    expect(dialog().length).toBe(0);
  });
});
