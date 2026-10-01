import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const { workspaceStatus, workspaceError } = useFinance();

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
    return <div className="min-h-screen bg-slate-950 text-red-200 flex items-center justify-center px-6 text-center">Could not load your workspace: {workspaceError || 'Unknown error'}</div>;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
