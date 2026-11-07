import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, clearSession, getStoredUser, getToken, setSession } from './api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  /** The session ended because the account no longer exists / was disabled / expired (not a manual logout). */
  expired: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [expired, setExpired] = useState(false);
  const lastCheck = useRef(0);

  // The server refuses a session whose account is gone (database reset, user removed): go back to login
  // instead of showing a driver app that looks alive but has no trips and sends its position nowhere.
  useEffect(() => {
    const onExpired = () => {
      setExpired(true);
      setUser(null);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  // At start and whenever the app comes back to the screen, ask who the database says this is: the driver
  // link in particular must come from the database, not from what was stored when the session began.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    const check = () => {
      if (document.visibilityState === 'hidden' || !getToken()) return;
      if (Date.now() - lastCheck.current < 20_000) return;
      lastCheck.current = Date.now();
      api
        .me()
        .then((fresh) => {
          setUser((cur) => {
            if (!cur || (cur.id === fresh.id && cur.role === fresh.role && cur.driverId === fresh.driverId && cur.name === fresh.name)) return cur;
            const token = getToken();
            if (token) setSession(token, fresh);
            return fresh;
          });
        })
        .catch(() => undefined); // offline or busy: try again later (a refused session signs out by itself)
    };
    check();
    document.addEventListener('visibilitychange', check);
    const id = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(id);
    };
  }, [signedIn]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      expired,
      login: async (email, password) => {
        const res = await api.login(email, password);
        setSession(res.token, res.user);
        setExpired(false);
        setUser(res.user);
        return res.user;
      },
      logout: () => {
        clearSession();
        setExpired(false);
        setUser(null);
      },
    }),
    [user, expired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
