import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import PageLoader from './PageLoader';

interface Props { 
  children: ReactNode; 
  role?: 'user' | 'admin';
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, role, allowedRoles }: Props) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return <PageLoader fullScreen label="Checking your session…" />;
  }
  
  if (!user) {
    const target = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={target} state={{ from: loc }} replace />;
  }

  const rawRole = user.role as string;
  const usernameLower = user.username.toLowerCase();

  // Normalize administrative contexts precisely matching identity contexts
  let effectiveRole = rawRole;
  if (rawRole === 'admin') {
    if (usernameLower.includes('bus') || usernameLower.includes('business')) {
      effectiveRole = 'business_admin';
    } else {
      effectiveRole = 'it_admin';
    }
  }

  const isAdminGroup = effectiveRole === 'business_admin' || effectiveRole === 'it_admin';

  if (role) {
    if (role === 'user' && effectiveRole !== 'user') {
      return <Navigate to={effectiveRole === 'it_admin' ? '/admin/logs' : '/admin/users'} replace />;
    }

    if (role === 'admin' && !isAdminGroup) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Explicitly deny view access rather than performing a silent route redirection
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-red-50 border border-red-200 rounded-xl max-w-xl mx-auto mt-16 shadow-sm">
        <ShieldAlert className="w-16 h-16 text-red-600 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">403 - Access Denied</h2>
        <p className="text-gray-600 text-center mb-6">
          Your current administrative classification profile does not possess authorization certificates for this directory module.
        </p>
        <div className="text-xs font-mono bg-gray-900 text-red-400 p-3 rounded border border-gray-800 w-full text-center">
          REJECT_SCOPE_VIOLATION // OPERATOR_ID: {user.username.toUpperCase()}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}