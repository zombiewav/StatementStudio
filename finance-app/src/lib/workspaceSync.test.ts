import { describe, expect, it, vi } from 'vitest';
import { BackupPayload } from '../types';
import {
  parseWorkspaceCache, reconcileWorkspace, RemoteWorkspace, WorkspaceCache,
  workspaceCacheKey, WorkspaceConflictError, workspaceFingerprint, WorkspaceSaveQueue, writeWorkspaceSafely,
} from './workspaceSync';

const books = (name = 'Organization'): BackupPayload => ({
  schemaVersion: 1, exportedAt: '2026-10-11T00:00:00Z', organizationName: name,
  accounts: [{ code: '1010', name: 'Cash', type: 'Assets', normalBalance: 'Debit', description: '', isActive: true }],
  journalEntries: [], projects: [], auditLogs: [],
  settings: { organizationName: name, fiscalYear: 'SY 2026-2027', currencySymbol: '₱', currencyCode: 'PHP' },
});
const cache = (overrides: Partial<WorkspaceCache> = {}): WorkspaceCache => ({
  version: 1, userId: 'user-a', modifiedAt: '2026-10-11T02:00:00Z',
  baseUpdatedAt: '2026-10-11T01:00:00Z', pending: true, data: books(), ...overrides,
});
const remote = (name = 'Other books', updated_at = '2026-10-11T01:00:00Z'): RemoteWorkspace => ({ data: books(name), updated_at });

describe('workspace recovery decisions', () => {
  it('restores unsaved local books when the server baseline is unchanged', () => {
    expect(reconcileWorkspace(cache(), remote())).toBe('local');
  });
  it('preserves both changed copies even if the browser clock claims to be newer', () => {
    expect(reconcileWorkspace(cache({ modifiedAt: '2099-01-01T00:00:00Z' }), remote('Other', '2026-10-11T03:00:00Z'))).toBe('conflict');
  });
  it('uses server books when the local copy has no pending changes', () => {
    expect(reconcileWorkspace(cache({ pending: false }), remote())).toBe('remote');
  });
  it('preserves a newer acknowledged cache when the server rolls back', () => {
    expect(reconcileWorkspace(cache({ pending: false, baseUpdatedAt: '2026-10-11T04:00:00Z' }), remote())).toBe('conflict');
  });
  it('preserves acknowledged books if the server row disappears', () => {
    expect(reconcileWorkspace(cache({ pending: false }), null)).toBe('conflict');
  });
  it('recovers an acknowledged write whose response was lost', () => {
    expect(reconcileWorkspace(cache(), remote('Organization', '2026-10-11T03:00:00Z'))).toBe('remote');
  });
  it('recovers a pending first save when no server row exists', () => {
    expect(reconcileWorkspace(cache({ baseUpdatedAt: null }), null)).toBe('local');
  });
  it('does not silently recreate a server row deleted after the local baseline', () => {
    expect(reconcileWorkspace(cache(), null)).toBe('conflict');
  });
  it('starts empty without importing an unowned legacy cache', () => {
    expect(reconcileWorkspace(null, null)).toBe('empty');
  });
  it('ignores backup export time when comparing books', () => {
    expect(workspaceFingerprint(books())).toBe(workspaceFingerprint({ ...books(), exportedAt: '2099-01-01' }));
  });
  it('recognizes identical JSONB data despite reordered object keys', () => {
    const reordered = JSON.parse(JSON.stringify(books(), (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value));
    expect(workspaceFingerprint(reordered)).toBe(workspaceFingerprint(books()));
    expect(reconcileWorkspace(cache(), { data: reordered, updated_at: 'new server version' })).toBe('remote');
  });
  it('isolates accounts and rejects a copy owned by someone else', () => {
    expect(workspaceCacheKey('user-a')).not.toBe(workspaceCacheKey('user-b'));
    expect(() => parseWorkspaceCache(JSON.stringify(cache()), 'user-b')).toThrow(/safely/);
    expect(parseWorkspaceCache(JSON.stringify(cache()), 'user-a')).toEqual(cache());
  });
  it('rejects invalid recovery copies without replacing them with empty books', () => {
    expect(() => parseWorkspaceCache('{bad', 'user-a')).toThrow();
    expect(() => parseWorkspaceCache(JSON.stringify(cache({ data: {} as BackupPayload })), 'user-a')).toThrow(/safely/);
  });
});

describe('acknowledged, serialized saves', () => {
  it('saves edits made during an in-flight write before a logout flush resolves', async () => {
    let complete!: (version: string) => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve; }))
      .mockResolvedValueOnce('version-3');
    const acknowledgement = vi.fn();
    const queue = new WorkspaceSaveQueue(books('First'), 'version-1', true, write, acknowledgement);
    const flight = queue.flush();
    queue.stage(books('Latest'));
    expect(queue.flush()).toBe(flight);
    expect(write).toHaveBeenCalledTimes(1);
    complete('version-2');
    await flight;
    expect(write).toHaveBeenNthCalledWith(2, books('Latest'), 'version-2');
    expect(queue.pending).toBe(false);
    expect(queue.baseUpdatedAt).toBe('version-3');
    expect(acknowledgement).toHaveBeenCalledTimes(2);
  });
  it('keeps failed writes pending and retries the latest snapshot', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('Session expired')).mockResolvedValueOnce('version-2');
    const queue = new WorkspaceSaveQueue(books(), 'version-1', true, write, vi.fn());
    await expect(queue.flush()).rejects.toThrow('Session expired');
    expect(queue.pending).toBe(true);
    expect(queue.baseUpdatedAt).toBe('version-1');
    queue.stage(books('Latest'));
    await queue.flush();
    expect(write).toHaveBeenLastCalledWith(books('Latest'), 'version-1');
    expect(queue.pending).toBe(false);
  });
  it('does not acknowledge newer changes when their write fails', async () => {
    let complete!: (version: string) => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { complete = resolve; }))
      .mockRejectedValueOnce(new Error('Offline'));
    const queue = new WorkspaceSaveQueue(books('First'), 'version-1', true, write, vi.fn());
    const flight = queue.flush();
    queue.stage(books('Latest'));
    complete('version-2');
    await expect(flight).rejects.toThrow('Offline');
    expect(queue.pending).toBe(true);
    expect(queue.baseUpdatedAt).toBe('version-2');
  });
  it('does not send another user’s edits or acknowledge a stopped session', async () => {
    let complete!: (version: string) => void;
    const write = vi.fn(() => new Promise<string>(resolve => { complete = resolve; }));
    const acknowledgement = vi.fn();
    const queue = new WorkspaceSaveQueue(books(), 'version-1', true, write, acknowledgement);
    const flight = queue.flush();
    queue.stage(books('Later'));
    queue.stop();
    complete('version-2');
    await expect(flight).rejects.toThrow(/account changed/);
    expect(write).toHaveBeenCalledTimes(1);
    expect(acknowledgement).not.toHaveBeenCalled();
    await expect(queue.flush()).rejects.toThrow(/account changed/);
  });
  it('does not write an unchanged acknowledged snapshot on every render', async () => {
    const write = vi.fn();
    const queue = new WorkspaceSaveQueue(books(), 'version-1', false, write, vi.fn());
    queue.stage({ ...books(), exportedAt: 'Later' });
    await queue.flush();
    expect(write).not.toHaveBeenCalled();
  });
});

describe('server write results', () => {
  const transport = () => ({
    insert: vi.fn().mockResolvedValue({ data: { updated_at: 'next' }, error: null }),
    update: vi.fn().mockResolvedValue({ data: { updated_at: 'next' }, error: null }),
    read: vi.fn().mockResolvedValue(remote()),
  });
  it('surfaces database, session, and payload errors instead of reporting success', async () => {
    const api = transport();
    api.update.mockResolvedValue({ data: null, error: { message: 'Permission denied', code: '42501' } });
    await expect(writeWorkspaceSafely(books(), 'base', api)).rejects.toThrow('Permission denied');
  });
  it('passes the baseline to a conditional update', async () => {
    const api = transport();
    await expect(writeWorkspaceSafely(books(), 'base', api)).resolves.toBe('next');
    expect(api.update).toHaveBeenCalledWith(books(), 'base');
    expect(api.insert).not.toHaveBeenCalled();
  });
  it('preserves the current remote copy on a concurrent update', async () => {
    const api = transport();
    api.update.mockResolvedValue({ data: null, error: null });
    await expect(writeWorkspaceSafely(books(), 'different baseline', api)).rejects.toMatchObject({ remote: remote() });
  });
  it('reports an ineffective update against an unchanged row as a save failure', async () => {
    const api = transport();
    api.update.mockResolvedValue({ data: null, error: null });
    await expect(writeWorkspaceSafely(books(), remote().updated_at, api)).rejects.toThrow(/save permissions/);
  });
  it('treats a concurrent first insert as a conflict, never an upsert', async () => {
    const api = transport();
    api.insert.mockResolvedValue({ data: null, error: { message: 'Duplicate row', code: '23505' } });
    await expect(writeWorkspaceSafely(books(), null, api)).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(api.update).not.toHaveBeenCalled();
  });
  it('acknowledges a committed update whose network response was lost', async () => {
    const api = transport();
    api.update.mockResolvedValue({ data: null, error: null });
    api.read.mockResolvedValue(remote('Organization', 'committed-version'));
    await expect(writeWorkspaceSafely(books(), 'old-version', api)).resolves.toBe('committed-version');
  });
  it('acknowledges a committed first insert on retry', async () => {
    const api = transport();
    api.insert.mockResolvedValue({ data: null, error: { message: 'Duplicate row', code: '23505' } });
    api.read.mockResolvedValue(remote('Organization', 'committed-version'));
    await expect(writeWorkspaceSafely(books(), null, api)).resolves.toBe('committed-version');
  });
});
