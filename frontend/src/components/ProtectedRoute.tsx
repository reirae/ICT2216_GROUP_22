import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props { children: ReactNode; role?: 'user' | 'admin' }

export function ProtectedRoute({ children, role }: Props) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }
  if (!user) {
    const target = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={target} state={{ from: loc }} replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/users' : '/dashboard'} replace />;
  }
  return <>{children}</>;
}
