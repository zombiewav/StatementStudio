import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BackupPayload } from '../types';
import { supabase } from '../lib/supabase';
import { validateBackupPayload } from '../lib/backupValidation';
import {
  parseWorkspaceCache, reconcileWorkspace, RemoteWorkspace, WorkspaceCache,
  workspaceCacheKey, workspaceConflictKey, WorkspaceConflictError, workspaceFingerprint, WorkspaceSaveQueue, writeWorkspaceSafely,
} from '../lib/workspaceSync';

export type WorkspaceSaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function useWorkspaceSync(
  snapshot: BackupPayload,
  apply: (data: BackupPayload) => void,
  createEmpty: (organizationName: string) => BackupPayload,
) {
  const { user, loading: authLoading } = useAuth();
  const [workspaceStatus, setWorkspaceStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<WorkspaceSaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const queueRef = useRef<WorkspaceSaveQueue | null>(null);
  const ownerRef = useRef<string | null>(null);
  const conflictRef = useRef<RemoteWorkspace | null>(null);
  const modifiedAtRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedRef = useRef<WorkspaceCache | null>(null);

  const persist = useCallback((queue: WorkspaceSaveQueue, userId: string) => {
    const cache: WorkspaceCache = {
      version: 1, userId, modifiedAt: modifiedAtRef.current,
      baseUpdatedAt: queue.baseUpdatedAt, pending: queue.pending, data: queue.data,
    };
    persistedRef.current = cache;
    try {
      localStorage.setItem(workspaceCacheKey(userId), JSON.stringify(cache));
      setLocalError(null);
    } catch {
      setLocalError('Could not save the recovery copy in this browser. Export a backup before leaving this page.');
    }
  }, []);

  const flushWorkspace = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const queue = queueRef.current;
    const userId = user?.id;
    if (!queue || ownerRef.current !== userId || !userId || workspaceStatus !== 'ready') return false;
    persist(queue, userId);
    if (saveStatus === 'conflict') return false;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await queue.flush();
      if (queueRef.current !== queue) return false;
      setSaveStatus('saved');
      persist(queue, userId);
      return true;
    } catch (error) {
      if (queueRef.current !== queue) return false;
      if (error instanceof WorkspaceConflictError) {
        conflictRef.current = error.remote;
        try {
          localStorage.setItem(workspaceConflictKey(userId), JSON.stringify({ local: persistedRef.current, remote: error.remote }));
        } catch {
          setLocalError('Could not preserve both copies in this browser. Download both backups before leaving.');
        }
        setSaveStatus('conflict');
      } else {
        setSaveStatus('error');
      }
      setSaveError(error instanceof Error ? error.message : 'Failed to save your workspace. Retry or export a backup.');
      return false;
    }
  }, [persist, saveStatus, user?.id, workspaceStatus]);
  const flushRef = useRef(flushWorkspace);
  useLayoutEffect(() => { flushRef.current = flushWorkspace; });

  useEffect(() => {
    if (authLoading) return;
    queueRef.current?.stop();
    queueRef.current = null;
    ownerRef.current = null;
    if (!user) { setWorkspaceStatus('idle'); return; }
    const userId = user.id;
    let active = true;
    setWorkspaceStatus('loading');
    setWorkspaceError(null);
    setSaveError(null);
    setLocalError(null);
    setSaveStatus('saved');

    const readRemote = async (): Promise<RemoteWorkspace | null> => {
      const { data, error } = await supabase.from('user_workspaces').select('data, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      if (data && (!validateBackupPayload(data.data).valid || typeof data.updated_at !== 'string')) {
        throw new Error('Your saved workspace could not be read safely.');
      }
      return data as RemoteWorkspace | null;
    };

    const load = async () => {
      try {
        let raw: string | null = null;
        try { raw = localStorage.getItem(workspaceCacheKey(userId)); }
        catch { setLocalError('This browser is blocking its recovery storage. Export a backup before leaving.'); }
        const local = parseWorkspaceCache(raw, userId);
        let remote: RemoteWorkspace | null = null;
        let readError: Error | null = null;
        try { remote = await readRemote(); }
        catch (error) {
          // An unavailable server must not erase or hide a valid owned cache.
          if (!local) throw error;
          readError = error instanceof Error ? error : new Error('Could not reach your saved workspace.');
        }
        if (!active) return;
        const decision = readError ? 'local' : reconcileWorkspace(local, remote);
        const selected = decision === 'local' || decision === 'conflict'
          ? local!.data
          : remote?.data ?? createEmpty(user.user_metadata.organization_name || 'My Organization');
        const base = decision === 'local' || decision === 'conflict' ? local!.baseUpdatedAt : remote?.updated_at ?? null;
        // An offline load must contact the server on retry, even if the cache
        // was previously clean. A no-op flush cannot verify server durability.
        const pending = decision === 'local' || decision === 'conflict' || !remote;
        modifiedAtRef.current = local?.modifiedAt ?? new Date().toISOString();
        conflictRef.current = decision === 'conflict' ? remote : null;

        let queue: WorkspaceSaveQueue;
        queue = new WorkspaceSaveQueue(selected, base, pending, async (data, baseUpdatedAt) => {
          // Compare-and-set: a changed row produces no returned row, not a silent overwrite.
          const updatedAt = new Date(Math.max(Date.now(), Date.parse(baseUpdatedAt || '') + 1 || 0)).toISOString();
          const row = { user_id: userId, data, updated_at: updatedAt };
          return writeWorkspaceSafely(data, baseUpdatedAt, {
            insert: () => supabase.from('user_workspaces').insert(row).select('updated_at').single(),
            update: (_data, base) => supabase.from('user_workspaces').update(row).eq('user_id', userId).eq('updated_at', base).select('updated_at').maybeSingle(),
            read: readRemote,
          });
        }, () => { if (active) persist(queue, userId); });
        queueRef.current = queue;
        ownerRef.current = userId;
        apply(selected);
        persist(queue, userId);
        if (decision === 'conflict') {
          setSaveStatus('conflict');
          setSaveError(new WorkspaceConflictError(remote).message);
          try { localStorage.setItem(workspaceConflictKey(userId), JSON.stringify({ local, remote })); }
          catch { setLocalError('Could not preserve both copies in this browser. Download both backups before leaving.'); }
        } else if (readError) {
          setSaveStatus('error');
          setSaveError(`Opened this browser’s recovery copy. Could not check the saved workspace: ${readError.message}`);
        }
        setWorkspaceStatus('ready');
      } catch (error) {
        if (active) {
          setWorkspaceStatus('error');
          setWorkspaceError(error instanceof Error ? error.message : 'Could not load your workspace.');
        }
      }
    };
    void load();
    return () => {
      active = false;
      queueRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [authLoading, user?.id, loadAttempt, apply, createEmpty, persist]);

  // Commit the entire recovery copy before scheduling a network write. Do not
  // write the old, unowned ss_* keys, including while loading another account.
  useLayoutEffect(() => {
    const queue = queueRef.current;
    if (!queue || workspaceStatus !== 'ready' || ownerRef.current !== user?.id) return;
    if (workspaceFingerprint(queue.data) !== workspaceFingerprint(snapshot)) modifiedAtRef.current = new Date().toISOString();
    queue.stage(snapshot);
    persist(queue, user!.id);
    if (queue.pending && saveStatus !== 'conflict') setSaveStatus('saving');
  }, [snapshot, workspaceStatus, user?.id, persist]);

  useEffect(() => {
    if (workspaceStatus !== 'ready' || !queueRef.current?.pending || saveStatus === 'conflict') return;
    timerRef.current = setTimeout(() => { void flushRef.current(); }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [snapshot, workspaceStatus, user?.id]);

  useEffect(() => {
    const hide = () => { void flushRef.current(); };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); };
    const online = () => { void flushRef.current(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('online', online);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('online', online);
    };
  }, []);

  const downloadLocalBackup = () => {
    const queue = queueRef.current;
    if (queue && ownerRef.current === user?.id) downloadJson(queue.data, 'StatementStudio-local-backup.json');
    else if (user) {
      try {
        const raw = localStorage.getItem(workspaceCacheKey(user.id));
        // Preserve malformed JSON too; decoding it must not prevent recovery.
        let value: unknown = raw;
        try { value = raw ? JSON.parse(raw) : {}; } catch { /* raw text is still recoverable */ }
        downloadJson(value, 'StatementStudio-recovery-cache.json');
      } catch { setLocalError('This browser is blocking access to its recovery copy.'); }
    }
  };
  const downloadServerBackup = () => downloadJson(conflictRef.current?.data ?? {}, 'StatementStudio-server-backup.json');

  const resolveWorkspaceConflict = async (choice: 'local' | 'remote') => {
    const queue = queueRef.current;
    if (!queue || saveStatus !== 'conflict' || !user || ownerRef.current !== user.id) return;
    const remote = conflictRef.current;
    if (choice === 'remote' && !remote) return;
    // Preserve both copies before either explicit replacement.
    downloadJson(queue.data, 'StatementStudio-local-backup.json');
    if (conflictRef.current) downloadServerBackup();
    if (choice === 'local') {
      queue.baseUpdatedAt = conflictRef.current?.updated_at ?? null;
      conflictRef.current = null;
      persist(queue, user.id);
      setSaveStatus('saving');
      setSaveError(null);
      // The ref uses the new conflict status on the following commit.
      timerRef.current = setTimeout(() => { void flushRef.current(); }, 0);
    } else {
      const data = remote!.data;
      // Re-load after explicitly discarding pending status; archived copies remain.
      const cache: WorkspaceCache = { version: 1, userId: user.id, modifiedAt: new Date().toISOString(), baseUpdatedAt: conflictRef.current?.updated_at ?? null, pending: false, data };
      try { localStorage.setItem(workspaceCacheKey(user.id), JSON.stringify(cache)); }
      catch { setLocalError('Could not update the browser recovery copy. The workspace has not been replaced.'); return; }
      queue.stop();
      setLoadAttempt(value => value + 1);
    }
  };

  const [hasLegacyBackup] = useState(() => {
    try { return localStorage.getItem('ss_journals') !== null; } catch { return false; }
  });
  const downloadLegacyBackup = () => {
    const keys = {
      accounts: 'ss_accounts', journalEntries: 'ss_journals', projects: 'ss_projects',
      auditLogs: 'ss_audit_logs', settings: 'ss_settings', closedFiscalYears: 'ss_closings',
      receiptAttachments: 'ss_receipts', customClassificationRules: 'ss_custom_rules',
      activityFeeRecords: 'ss_activity_fees', draftTransactions: 'ss_drafts',
      financialStatementHistory: 'ss_fs_history', reportingPeriodWorkspaces: 'ss_period_workspaces',
    };
    let raw: Record<string, string | null>;
    try { raw = Object.fromEntries(Object.values(keys).map(key => [key, localStorage.getItem(key)])); }
    catch { setLocalError('This browser is blocking access to its older recovery copy.'); return; }
    try {
      const legacy = { ...createEmpty('Recovered browser workspace'), ...Object.fromEntries(
        Object.entries(keys).filter(([, key]) => raw[key] !== null).map(([field, key]) => [field, JSON.parse(raw[key]!)]),
      ) };
      legacy.organizationName = legacy.settings.organizationName;
      downloadJson(legacy, 'StatementStudio-legacy-browser-backup.json');
    } catch {
      downloadJson(raw, 'StatementStudio-legacy-browser-raw-recovery.json');
    }
  };

  return {
    workspaceStatus, workspaceError, workspaceSaveStatus: saveStatus,
    workspaceSaveError: saveError, workspaceLocalError: localError,
    hasWorkspaceServerCopy: conflictRef.current !== null,
    flushWorkspace, downloadLocalBackup, downloadServerBackup, downloadLegacyBackup, hasLegacyBackup, resolveWorkspaceConflict,
    retryWorkspaceLoad: () => setLoadAttempt(value => value + 1),
  };
}
