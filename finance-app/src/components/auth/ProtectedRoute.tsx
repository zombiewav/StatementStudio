import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { workspaceStatus, workspaceError, retryWorkspaceLoad, downloadLocalBackup, hasLegacyBackup, downloadLegacyBackup } = useFinance();

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">Restoring your session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (workspaceStatus === 'loading' || workspaceStatus === 'idle') {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">Loading your workspace...</div>;
  }

  if (workspaceStatus === 'error') {
    return <div className="min-h-screen bg-slate-950 text-red-200 flex flex-col gap-4 items-center justify-center px-6 text-center">
      <p>Could not load your workspace: {workspaceError || 'Unknown error'}</p>
      <button type="button" onClick={retryWorkspaceLoad} className="rounded border px-3 py-2">Retry loading</button>
      <button type="button" onClick={downloadLocalBackup} className="rounded border px-3 py-2">Download browser recovery copy</button>
      {hasLegacyBackup && <button type="button" onClick={downloadLegacyBackup} className="rounded border px-3 py-2">Download older browser backup</button>}
    </div>;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
