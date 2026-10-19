import { createElement } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Navbar } from './Navbar';

const navigate = vi.fn();
const signOut = vi.fn();
const flushWorkspace = vi.fn();

vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: (...args: unknown[]) => signOut(...args) } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../context/FinanceContext', () => ({
  useFinance: () => ({
    settings: { organizationName: 'Org', currencySymbol: '₱' }, auditLogs: [], reportingPeriodWorkspaces: [],
    switchReportingPeriod: () => undefined, flushWorkspace: () => flushWorkspace(),
  }),
}));
vi.mock('./ThemeToggle', () => ({ ThemeToggle: () => null }));

let renderer: ReactTestRenderer;
const text = (node: any): string => (node.children || []).map((child: any) => typeof child === 'string' ? child : text(child)).join(' ').replace(/\s+/g, ' ');
const logout = () => renderer.root.findAllByType('button').find(item => item.props['aria-label'] === 'Logout')!;
const anyway = () => renderer.root.findAllByType('button').find(item => text(item).includes('Log out anyway'));

beforeEach(() => {
  vi.stubGlobal('document', { addEventListener: () => undefined, removeEventListener: () => undefined });
  navigate.mockReset(); signOut.mockReset().mockResolvedValue({ error: null }); flushWorkspace.mockReset();
  act(() => { renderer = create(createElement(Navbar, { onMenuToggle: () => undefined, searchTerm: '', setSearchTerm: () => undefined, onSearchSubmit: () => undefined, onOpenSettings: () => undefined })); });
});
afterEach(() => { act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe('Navbar logout', () => {
  it('signs out normally once the workspace is saved', async () => {
    flushWorkspace.mockResolvedValue(true);
    await act(async () => { await logout().props.onClick(); });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(anyway()).toBeUndefined();
  });

  it('a save conflict pauses logout but offers Log out anyway, which signs out without saving', async () => {
    flushWorkspace.mockResolvedValue(false);
    await act(async () => { await logout().props.onClick(); });
    expect(signOut).not.toHaveBeenCalled();
    expect(text(renderer.root)).toContain('Logout paused');
    expect(anyway()).toBeDefined();
    await act(async () => { await anyway()!.props.onClick(); });
    expect(flushWorkspace).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
