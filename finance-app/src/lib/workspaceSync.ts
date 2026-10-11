import { BackupPayload } from '../types';
import { validateBackupPayload } from './backupValidation';

export interface WorkspaceCache {
  version: 1;
  userId: string;
  modifiedAt: string;
  baseUpdatedAt: string | null;
  pending: boolean;
  data: BackupPayload;
}

export interface RemoteWorkspace {
  data: BackupPayload;
  updated_at: string;
}

export const workspaceCacheKey = (userId: string) => `ss_workspace:${userId}`;
export const workspaceConflictKey = (userId: string) => `ss_workspace_conflict:${userId}`;

// Export time describes a backup operation, not a change to the books.
export function workspaceFingerprint(data: BackupPayload): string {
  const { exportedAt: _exportedAt, ...books } = data;
  // Postgres JSONB may return object keys in a different order. Compare the
  // contents, while keeping the order of journal lines and other arrays.
  return JSON.stringify(books, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
    }
    return value;
  });
}

export function parseWorkspaceCache(raw: string | null, userId: string): WorkspaceCache | null {
  if (!raw) return null;
  const cache = JSON.parse(raw) as WorkspaceCache;
  if (!cache || cache.version !== 1 || cache.userId !== userId || typeof cache.pending !== 'boolean'
    || typeof cache.modifiedAt !== 'string'
    || (cache.baseUpdatedAt !== null && typeof cache.baseUpdatedAt !== 'string')
    || !validateBackupPayload(cache.data).valid) {
    throw new Error('The local recovery copy could not be read safely. Export it before replacing it.');
  }
  return cache;
}

export function reconcileWorkspace(local: WorkspaceCache | null, remote: RemoteWorkspace | null): 'local' | 'remote' | 'conflict' | 'empty' {
  if (!local) return remote ? 'remote' : 'empty';
  if (remote && workspaceFingerprint(local.data) === workspaceFingerprint(remote.data)) return 'remote';
  if (!local.pending) {
    // Preserve an acknowledged copy if the server appears to have rolled
    // back or lost its row. A newer server copy can still replace a clean cache.
    if (local.baseUpdatedAt && (!remote || Date.parse(remote.updated_at) < Date.parse(local.baseUpdatedAt))) return 'conflict';
    return remote ? 'remote' : 'empty';
  }
  if (local.baseUpdatedAt === (remote?.updated_at ?? null)) return 'local';
  return 'conflict';
}

export class WorkspaceConflictError extends Error {
  constructor(public remote: RemoteWorkspace | null) {
    super(remote
      ? 'The saved workspace changed elsewhere. Both copies are available. Choose which copy to use.'
      : 'The saved workspace is unavailable. Your browser copy is preserved. Retry loading or keep this copy after reviewing your backup.');
  }
}

interface WriteResult {
  data: { updated_at: string } | null;
  error: { message: string; code?: string } | null;
}

export async function writeWorkspaceSafely(
  data: BackupPayload,
  baseUpdatedAt: string | null,
  transport: {
    insert: (data: BackupPayload) => PromiseLike<WriteResult>;
    update: (data: BackupPayload, base: string) => PromiseLike<WriteResult>;
    read: () => Promise<RemoteWorkspace | null>;
  },
): Promise<string> {
  const result = baseUpdatedAt === null ? await transport.insert(data) : await transport.update(data, baseUpdatedAt);
  if (result.error && result.error.code !== '23505') throw new Error(result.error.message);
  if (!result.data || result.error?.code === '23505') {
    const remote = await transport.read();
    // The server can commit a request even when its response is lost. Retry
    // may acknowledge identical books without asking to overwrite anything.
    if (remote && workspaceFingerprint(remote.data) === workspaceFingerprint(data)) return remote.updated_at;
    if (remote && remote.updated_at === baseUpdatedAt) {
      throw new Error('Your workspace could not be updated. Check your sign-in and workspace save permissions, then retry.');
    }
    throw new WorkspaceConflictError(remote);
  }
  return result.data.updated_at;
}

// No React, browser, or Supabase dependencies. One write is in flight at a time;
// acknowledgement of an older snapshot never marks newer changes as saved.
export class WorkspaceSaveQueue {
  private current: BackupPayload;
  private acknowledged: string;
  private flight: Promise<void> | null = null;
  private stopped = false;

  constructor(
    initial: BackupPayload,
    public baseUpdatedAt: string | null,
    pending: boolean,
    private write: (data: BackupPayload, baseUpdatedAt: string | null) => Promise<string>,
    private acknowledge: () => void,
  ) {
    this.current = initial;
    this.acknowledged = pending ? '' : workspaceFingerprint(initial);
  }

  stage(data: BackupPayload) { this.current = data; }
  get data() { return this.current; }
  get pending() { return workspaceFingerprint(this.current) !== this.acknowledged; }
  stop() { this.stopped = true; }

  flush(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('The signed-in account changed. Sign in again to save its workspace.'));
    if (this.flight) return this.flight;
    this.flight = this.drain().finally(() => { this.flight = null; });
    return this.flight;
  }

  private async drain() {
    while (this.pending && !this.stopped) {
      const snapshot = this.current;
      const fingerprint = workspaceFingerprint(snapshot);
      const updatedAt = await this.write(snapshot, this.baseUpdatedAt);
      this.baseUpdatedAt = updatedAt;
      this.acknowledged = fingerprint;
      if (!this.stopped) this.acknowledge();
    }
    if (this.stopped) throw new Error('The signed-in account changed before saving finished.');
  }
}
