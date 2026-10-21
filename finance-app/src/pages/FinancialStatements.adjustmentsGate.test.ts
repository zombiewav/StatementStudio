import { ComponentType, createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { ADJUSTMENTS_GATE_MESSAGE, ADJUSTMENTS_PROCEED_PROMPT, UNADJUSTED_WARNING } from '../lib/otherAdjustments';
import { FinancialStatements } from './FinancialStatements';

vi.mock('../hooks/useWorkspaceSync', () => ({ useWorkspaceSync: () => ({ workspaceStatus: 'ready' }) }));
vi.mock('canvas-confetti', () => ({ default: () => undefined }));

let renderer: ReactTestRenderer;
let finance: ReturnType<typeof useFinance>;
let navigated: string[] = [];
const Statements = FinancialStatements as unknown as ComponentType<Record<string, unknown>>;
function Probe() { finance = useFinance(); return createElement(Statements, { onNavigate: (page: string) => { navigated.push(page); } }); }
afterEach(() => { if (renderer) act(() => renderer.unmount()); });
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const button = (label: string) => renderer.root.findAllByType('button').find(item => text(item).includes(label))!;
const hasButton = (label: string) => renderer.root.findAllByType('button').some(item => text(item).includes(label));
const warnings = () => renderer.root.findAll(node => node.props?.['data-unadjusted-warning'] === 'true');
const KEY = '2026::1st Semester';

// 1,000 of cash and no PPE or prepaid assets: the only adjustment outstanding is the Cash question.
function start() {
  navigated = [];
  act(() => { renderer = create(createElement(FinanceProvider, null, createElement(Probe))); });
  act(() => {
    finance.updateSettings({ semester: '1st Semester', reportingYear: 2026 } as never);
    finance.addJournalEntry('2026-10-01', 'capital', 'General Fund Operations', [{ accountCode: '1010', debit: 1000, credit: 0 }, { accountCode: '4040', debit: 0, credit: 1000 }]);
  });
}

describe('Financial Statements wait for the end-of-semester adjustments', () => {
  it('does not generate while adjustments are outstanding: shows the message and a way to Other Adjustments', () => {
    start();
    const shown = text(renderer.root);
    expect(shown).toContain(ADJUSTMENTS_GATE_MESSAGE);
    expect(shown).not.toContain('As of');
    expect(button('Print Statement').props.disabled).toBe(true);
    act(() => { button('Go to Other Adjustments').props.onClick(); });
    expect(navigated).toEqual(['other-adjustments']);
  });

  it('generates without a warning once every adjustment is updated', () => {
    start();
    act(() => { finance.updateSettings({ otherAdjustments: { [KEY]: { cashBankAndEwallet: 0 } } } as never); });
    const shown = text(renderer.root);
    expect(shown).toContain('As of');
    expect(shown).not.toContain(ADJUSTMENTS_GATE_MESSAGE);
    expect(warnings()).toHaveLength(0);
    expect(button('Print Statement').props.disabled).toBeFalsy();
  });

  it('asks for confirmation before viewing without adjusting, and NO returns to Other Adjustments without generating anything', () => {
    start();
    act(() => { button('View statements without adjusting').props.onClick(); });
    expect(text(renderer.root)).toContain(ADJUSTMENTS_PROCEED_PROMPT);
    expect(hasButton('YES — Proceed Anyway')).toBe(true);
    act(() => { button('NO — Return to Adjustments').props.onClick(); });
    expect(navigated).toEqual(['other-adjustments']);
    const shown = text(renderer.root);
    expect(shown).not.toContain('As of');
    expect(shown).toContain(ADJUSTMENTS_GATE_MESSAGE);
    expect(warnings()).toHaveLength(0);
  });

  it('YES shows the statements with the red UNADJUSTED note at the bottom of every statement, and completes nothing', () => {
    start();
    act(() => { button('View statements without adjusting').props.onClick(); });
    act(() => { button('YES — Proceed Anyway').props.onClick(); });
    expect(text(renderer.root)).toContain('As of');
    for (const label of ['Statement of Financial Position', 'Statement of Activities', 'Statement of Functional Expenses', 'Statement of Cash Flows']) {
      expect(hasButton(label)).toBe(true);
      act(() => { button(label).props.onClick(); });
      expect(renderer.root.findAllByType('h2').some(heading => text(heading).includes(label))).toBe(true);
      expect(warnings()).toHaveLength(1);
      expect(text(warnings()[0])).toBe(UNADJUSTED_WARNING);
      expect(warnings()[0].props.className).toContain('text-rose-600');
    }
    expect(button('Print Statement').props.disabled).toBeFalsy();
    // Proceeding anyway never marks the outstanding adjustment as completed.
    expect((finance.settings as any).otherAdjustments?.[KEY]).toBeUndefined();
  });

  it('drops the note and the exception once the adjustments are completed', () => {
    start();
    act(() => { button('View statements without adjusting').props.onClick(); });
    act(() => { button('YES — Proceed Anyway').props.onClick(); });
    expect(warnings()).toHaveLength(1);
    act(() => { finance.updateSettings({ otherAdjustments: { [KEY]: { cashBankAndEwallet: 0 } } } as never); });
    expect(warnings()).toHaveLength(0);
    expect(text(renderer.root)).toContain('As of');
  });

  it('still holds back drafts and open Review items first; the exception does not skip them', () => {
    start();
    act(() => { button('View statements without adjusting').props.onClick(); });
    act(() => { button('YES — Proceed Anyway').props.onClick(); });
    act(() => { finance.saveDraftTransaction({ id: 'd1', category: 'merchandise', label: 'Sale of Merchandise', formState: {} }); });
    expect(text(renderer.root)).toContain("Statements aren't ready yet");
    expect(warnings()).toHaveLength(0);
  });
});
