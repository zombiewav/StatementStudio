import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { createElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupPayload } from '../types';
import { RemoteWorkspace, WorkspaceCache, workspaceCacheKey, workspaceConflictKey } from '../lib/workspaceSync';
import { useWorkspaceSync } from './useWorkspaceSync';

const database = vi.hoisted(() => ({
  userId: 'user-a', remote: null as RemoteWorkspace | null,
  readError: null as string | null, writeError: null as string | null,
  writes: [] as BackupPayload[], readCount: 0,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({
  user: { id: database.userId, user_metadata: { organization_name: 'Own organization' } }, loading: false,
}) }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => {
  let operation: 'read' | 'insert' | 'update' = 'read';
  let row: RemoteWorkspace;
  let baseline: string | null = null;
  const run = async () => {
    if (operation === 'read') {
      database.readCount++;
      return { data: database.remote, error: database.readError ? { message: database.readError } : null };
    }
    database.writes.push(row.data);
    if (database.writeError) return { data: null, error: { message: database.writeError } };
    if (operation === 'insert' && database.remote) return { data: null, error: { message: 'Duplicate', code: '23505' } };
    if (operation === 'update' && database.remote?.updated_at !== baseline) return { data: null, error: null };
    database.remote = row;
    return { data: { updated_at: row.updated_at }, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (field: string, value: string) => { if (field === 'updated_at') baseline = value; return builder; },
    insert: (value: RemoteWorkspace) => { operation = 'insert'; row = value; return builder; },
    update: (value: RemoteWorkspace) => { operation = 'update'; row = value; return builder; },
    maybeSingle: run, single: run,
  };
  return builder;
} } }));

const empty = (organizationName: string): BackupPayload => ({
  schemaVersion: 1, exportedAt: '2026-10-11T00:00:00Z', organizationName,
  accounts: [{ code: '1010', name: 'Cash', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true }],
  journalEntries: [], projects: [], auditLogs: [],
  settings: { organizationName, fiscalYear: 'SY 2026-2027', currencySymbol: '₱', currencyCode: 'PHP' },
});
const savedCache = (data: BackupPayload, pending = true): WorkspaceCache => ({
  version: 1, userId: 'user-a', modifiedAt: '2026-10-11T02:00:00Z',
  baseUpdatedAt: '2026-10-11T01:00:00Z', pending, data,
});
class MemoryStorage {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error('Quota exceeded'); this.values.set(key, value); }
}
let storage: MemoryStorage;
let downloads: string[];
let root: ReactTestRenderer | undefined;
let exposed: { data: BackupPayload; setData: (data: BackupPayload) => void; sync: ReturnType<typeof useWorkspaceSync> };
function Harness() {
  const [data, setData] = useState(() => empty('Initial'));
  const sync = useWorkspaceSync(data, setData, empty);
  exposed = { data, setData, sync };
  return null;
}
const mount = async () => { await act(async () => { root = create(createElement(Harness)); }); };
const saveAfterDelay = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(600); }); };
const cached = () => JSON.parse(storage.getItem(workspaceCacheKey(database.userId))!) as WorkspaceCache;

beforeEach(() => {
  vi.useFakeTimers();
  database.userId = 'user-a';
  database.remote = { data: empty('Server'), updated_at: '2026-10-11T01:00:00Z' };
  database.readError = null;
  database.writeError = null;
  database.writes = [];
  database.readCount = 0;
  storage = new MemoryStorage();
  downloads = [];
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('document', Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    createElement: () => ({ href: '', download: '', click() { downloads.push(this.download); } }),
  }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:backup', revokeObjectURL: () => {} });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('React workspace persistence', () => {
  it('leaves legacy data untouched and caches the loaded server under its owner', async () => {
    storage.setItem('ss_journals', 'older browser records');
    await mount();
    expect(exposed.data.organizationName).toBe('Server');
    expect(storage.getItem('ss_journals')).toBe('older browser records');
    expect(cached().userId).toBe('user-a');
    expect(cached().pending).toBe(false);
    expect(database.writes).toHaveLength(0);
  });
  it('persists a newly added journal before the debounce and flushes before logout', async () => {
    await mount();
    const changed = { ...exposed.data, journalEntries: [{
      id: 'pending-journal', reference: 'JE-0001', date: '2026-10-11', description: 'Entry',
      project: 'General Fund Operations', lines: [{ accountCode: '1010', debit: 1, credit: 0 }, { accountCode: '3010', debit: 0, credit: 1 }],
    }] };
    act(() => exposed.setData(changed));
    expect(cached().data.journalEntries).toEqual(changed.journalEntries);
    expect(cached().pending).toBe(true);
    expect(database.writes).toHaveLength(0);
    await act(async () => { expect(await exposed.sync.flushWorkspace()).toBe(true); });
    expect(database.remote?.data.journalEntries).toEqual(changed.journalEntries);
    expect(exposed.sync.workspaceSaveStatus).toBe('saved');
    expect(cached().pending).toBe(false);
  });
  it('recovers a pending journal snapshot on reload instead of applying stale server books', async () => {
    storage.setItem(workspaceCacheKey('user-a'), JSON.stringify(savedCache(empty('Unsaved books'))));
    await mount();
    expect(exposed.data.organizationName).toBe('Unsaved books');
    expect(cached().pending).toBe(true);
    await saveAfterDelay();
    expect(database.remote?.data.organizationName).toBe('Unsaved books');
    expect(exposed.sync.workspaceSaveStatus).toBe('saved');
  });
  it('shows failures, keeps the pending cache, blocks logout, and retries successfully', async () => {
    await mount();
    database.writeError = 'Session expired';
    act(() => exposed.setData(empty('Pending')));
    await saveAfterDelay();
    expect(exposed.sync.workspaceSaveStatus).toBe('error');
    expect(exposed.sync.workspaceSaveError).toBe('Session expired');
    expect(cached().pending).toBe(true);
    await act(async () => { expect(await exposed.sync.flushWorkspace()).toBe(false); });
    database.writeError = null;
    await act(async () => { expect(await exposed.sync.flushWorkspace()).toBe(true); });
    expect(cached().pending).toBe(false);
  });
  it('opens an owned offline cache and verifies cloud persistence when the connection returns', async () => {
    storage.setItem(workspaceCacheKey('user-a'), JSON.stringify(savedCache(empty('Offline'), false)));
    database.readError = 'Offline';
    database.writeError = 'Offline';
    await mount();
    expect(exposed.data.organizationName).toBe('Offline');
    expect(cached().pending).toBe(true);
    await saveAfterDelay();
    expect(exposed.sync.workspaceSaveStatus).toBe('error');
    database.readError = null;
    database.writeError = null;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(database.remote?.data.organizationName).toBe('Offline');
    expect(exposed.sync.workspaceSaveStatus).toBe('saved');
  });
  it('does not silently replace either copy after a concurrent server change', async () => {
    storage.setItem(workspaceCacheKey('user-a'), JSON.stringify(savedCache(empty('Local'))));
    database.remote = { data: empty('Changed elsewhere'), updated_at: '2026-10-11T03:00:00Z' };
    await mount();
    expect(exposed.data.organizationName).toBe('Local');
    expect(exposed.sync.workspaceSaveStatus).toBe('conflict');
    expect(JSON.parse(storage.getItem(workspaceConflictKey('user-a'))!).remote.data.organizationName).toBe('Changed elsewhere');
    await saveAfterDelay();
    await act(async () => { expect(await exposed.sync.flushWorkspace()).toBe(false); });
    expect(database.writes).toHaveLength(0);
  });
  it('reports browser quota failure while still saving to the server', async () => {
    storage.failWrites = true;
    await mount();
    act(() => exposed.setData(empty('New books')));
    expect(exposed.sync.workspaceLocalError).toMatch(/recovery copy/);
    await saveAfterDelay();
    expect(database.remote?.data.organizationName).toBe('New books');
    expect(exposed.sync.workspaceLocalError).toMatch(/recovery copy/);
  });
  it('flushes pending changes on page hide without waiting for the timer', async () => {
    await mount();
    act(() => exposed.setData(empty('Page leaving')));
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(database.remote?.data.organizationName).toBe('Page leaving');
    expect(exposed.sync.workspaceSaveStatus).toBe('saved');
  });
  it('does not import legacy books into a new login with no remote workspace', async () => {
    database.remote = null;
    storage.setItem('ss_journals', 'older financial records');
    await mount();
    expect(exposed.data.organizationName).toBe('Own organization');
    expect(exposed.data.journalEntries).toEqual([]);
    await saveAfterDelay();
    expect(storage.getItem('ss_journals')).toBe('older financial records');
    expect(database.remote).toMatchObject({ data: { journalEntries: [] } });
  });
  it('preserves corrupt recovery data and offers a load error rather than overwriting it', async () => {
    storage.setItem(workspaceCacheKey('user-a'), '{corrupt');
    await mount();
    expect(exposed.sync.workspaceStatus).toBe('error');
    expect(storage.getItem(workspaceCacheKey('user-a'))).toBe('{corrupt');
    expect(database.writes).toHaveLength(0);
  });
  it('downloads both copies before explicitly choosing the server books', async () => {
    storage.setItem(workspaceCacheKey('user-a'), JSON.stringify(savedCache(empty('Local'))));
    database.remote = { data: empty('Changed elsewhere'), updated_at: '2026-10-11T03:00:00Z' };
    await mount();
    await act(async () => { await exposed.sync.resolveWorkspaceConflict('remote'); });
    expect(downloads).toEqual(['StatementStudio-local-backup.json', 'StatementStudio-server-backup.json']);
    expect(exposed.data.organizationName).toBe('Changed elsewhere');
    expect(cached().pending).toBe(false);
    expect(storage.getItem(workspaceConflictKey('user-a'))).not.toBeNull();
  });
  it('uses the reviewed server version when explicitly keeping the browser copy', async () => {
    storage.setItem(workspaceCacheKey('user-a'), JSON.stringify(savedCache(empty('Local'))));
    database.remote = { data: empty('Changed elsewhere'), updated_at: '2026-10-11T03:00:00Z' };
    await mount();
    await act(async () => { await exposed.sync.resolveWorkspaceConflict('local'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(downloads).toHaveLength(2);
    expect(database.remote?.data.organizationName).toBe('Local');
    expect(exposed.sync.workspaceSaveStatus).toBe('saved');
    expect(storage.getItem(workspaceConflictKey('user-a'))).not.toBeNull();
  });
  it('never replaces local books with empty data when the server copy is unavailable', async () => {
    storage.setItem(workspaceCacheKey('user-a'), JSON.stringify(savedCache(empty('Local'))));
    database.remote = null;
    await mount();
    expect(exposed.sync.hasWorkspaceServerCopy).toBe(false);
    await act(async () => { await exposed.sync.resolveWorkspaceConflict('remote'); });
    expect(exposed.data.organizationName).toBe('Local');
    expect(cached().pending).toBe(true);
    expect(downloads).toHaveLength(0);
  });
});
