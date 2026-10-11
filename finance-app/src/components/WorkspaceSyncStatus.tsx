import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';

export function WorkspaceSyncStatus(): React.ReactElement {
  const { user } = useAuth();
  const {
    workspaceSaveStatus, workspaceSaveError, workspaceLocalError, flushWorkspace,
    downloadLocalBackup, downloadServerBackup, resolveWorkspaceConflict,
    hasLegacyBackup, downloadLegacyBackup,
    hasWorkspaceServerCopy, retryWorkspaceLoad,
  } = useFinance();
  const [choice, setChoice] = useState<'local' | 'remote' | null>(null);
  const failed = workspaceSaveStatus === 'error' || workspaceSaveStatus === 'conflict' || !!workspaceLocalError;
  const button = 'rounded border border-current px-2 py-1 text-xs font-semibold';
  return <div className={`border-b px-4 py-2 text-xs md:px-6 ${failed ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}>
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" aria-live="polite" className="font-semibold">{workspaceSaveStatus === 'saved' ? 'Saved' : workspaceSaveStatus === 'saving' ? 'Saving…' : workspaceSaveStatus === 'conflict' ? 'Save conflict' : 'Failed to save'}</span>
      <span className="break-all">Account: {user?.email}</span>
      {workspaceSaveStatus === 'error' && <button type="button" className={button} onClick={() => { void flushWorkspace(); }}>Retry save</button>}
      {failed && <button type="button" className={button} onClick={downloadLocalBackup}>Download local backup</button>}
      {workspaceSaveStatus === 'conflict' && <>
        {hasWorkspaceServerCopy && <button type="button" className={button} onClick={downloadServerBackup}>Download saved backup</button>}
        <button type="button" className={button} onClick={() => setChoice('local')}>Keep this browser’s copy</button>
        {hasWorkspaceServerCopy
          ? <button type="button" className={button} onClick={() => setChoice('remote')}>Use saved copy</button>
          : <button type="button" className={button} onClick={retryWorkspaceLoad}>Retry loading saved copy</button>}
      </>}
      {hasLegacyBackup && <button type="button" className={button} onClick={downloadLegacyBackup}>Download older browser backup</button>}
    </div>
    {workspaceSaveError && <p role="alert" className="mt-1 break-words">{workspaceSaveError}</p>}
    {workspaceLocalError && <p role="alert" className="mt-1">{workspaceLocalError}</p>}
    {hasLegacyBackup && <p className="mt-1">An older browser copy is preserved. Check its organization and contents before restoring it from Settings.</p>}
    {choice && workspaceSaveStatus === 'conflict' && <div className="mt-2 space-y-2">
      <p>{choice === 'local' ? 'Replace the saved workspace with this browser’s copy? Changes made elsewhere may be removed from the active books.' : 'Replace this browser’s active books with the saved workspace? Unsaved changes will remain in the downloaded backup.'} {hasWorkspaceServerCopy ? 'Both backups will be downloaded first.' : 'Your browser backup will be downloaded first.'}</p>
      <button type="button" className={button} onClick={() => { const selected = choice; setChoice(null); void resolveWorkspaceConflict(selected); }}>Download backups and confirm</button>{' '}
      <button type="button" className={button} onClick={() => setChoice(null)}>Cancel</button>
    </div>}
  </div>;
}
