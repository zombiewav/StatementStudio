import React from 'react';
import { Navigate } from 'react-router';
import { readOrgAccount } from '../../lib/localAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const account = readOrgAccount(localStorage.getItem('orgAccount'));
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

  if (!account) {
    localStorage.removeItem('isLoggedIn');
    return <Navigate to="/register" replace />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
