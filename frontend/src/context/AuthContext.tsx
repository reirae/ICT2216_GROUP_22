import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setCsrfToken } from '../api/client';
import { setTabSessionId } from '../api/client';

export interface SessionUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'user' | 'admin';
  account_number: string | null;
  user_id?: number;      
  admin_id?: number;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (role: 'user' | 'admin', body: { username: string; password: string; captcha: string }) => Promise<any>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: SessionUser }>('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    refresh(); 
    
    const handleUnauthorized = () => {
      setUser(null);
    }; 
    
    window.addEventListener('auth-unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('auth-unauthorized', handleUnauthorized);
    };
  }, [refresh]);

  const login = useCallback(
    async (role: 'user' | 'admin', body: { username: string; password: string; captcha: string }) => {
      const path = role === 'admin' ? '/auth/admin/login' : '/auth/login';
      const response = await api.post<any>(path, body);
      
      if (response && response.user) {
        setUser(response.user);
      }
      return response;
    },
    []
  );

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setCsrfToken(null);
    setTabSessionId(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
