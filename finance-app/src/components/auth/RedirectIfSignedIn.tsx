import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { publicPageAction, SIGNED_IN_HOME } from '../../lib/authRoute';

interface RedirectIfSignedInProps {
  children: React.ReactNode;
}

/** Wraps the home, login and register pages so a signed-in visitor stays signed in. */
export const RedirectIfSignedIn: React.FC<RedirectIfSignedInProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const action = publicPageAction({ loading, signedIn: !!user });

  if (action === 'wait') {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">Restoring your session...</div>;
  }
  if (action === 'redirect-to-app') return <Navigate to={SIGNED_IN_HOME} replace />;
  return <>{children}</>;
};

export default RedirectIfSignedIn;
