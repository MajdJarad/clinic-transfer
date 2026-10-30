import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, clearSession, getStoredUser, setSession } from './api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email, password) => {
        const res = await api.login(email, password);
        setSession(res.token, res.user);
        setUser(res.user);
        return res.user;
      },
      logout: () => {
        clearSession();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
