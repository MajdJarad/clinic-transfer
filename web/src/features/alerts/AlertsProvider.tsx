import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { AlertItem } from '../../types';
import { playSiren, unlockAudioOnFirstTouch } from './siren';

const POLL_MS = 4000;
const REPEAT_SIREN_MS = 9000; // until somebody takes it over

interface AlertsValue {
  /** Alerts nobody has resolved yet (open or taken over), newest first. */
  alerts: AlertItem[];
  /** Alerts nobody has taken over yet. */
  openCount: number;
  ack: (id: string) => Promise<void>;
  resolve: (id: string) => Promise<void>;
  refresh: () => void;
}

const Ctx = createContext<AlertsValue>({ alerts: [], openCount: 0, ack: async () => {}, resolve: async () => {}, refresh: () => {} });
export const useAlerts = () => useContext(Ctx);

/**
 * Watches for driver alerts everywhere in the coordinator's app: polls every few seconds, and while any
 * alert is still unclaimed it sounds a siren on every new one and then every few seconds, and flashes the
 * tab title, so it cannot be missed.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const refresh = useCallback(() => {
    if (document.visibilityState === 'hidden') return;
    api.alerts
      .list()
      .then((list) => {
        const fresh = list.filter((a) => a.status === 'OPEN' && !seen.current.has(a.id));
        // Alerts already there when the page opened still need attention but do not need a second siren.
        if (fresh.length && !first.current) playSiren();
        list.forEach((a) => seen.current.add(a.id));
        first.current = false;
        setAlerts(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    const stop = unlockAudioOnFirstTouch();
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      stop();
    };
  }, [refresh]);

  const openCount = alerts.filter((a) => a.status === 'OPEN').length;

  // Keep making noise (and flashing the tab) while something is unclaimed.
  useEffect(() => {
    if (!openCount) return;
    const siren = setInterval(playSiren, REPEAT_SIREN_MS);
    const original = document.title;
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      document.title = on ? `🚨 إنذار عاجل (${openCount})` : original;
    }, 1000);
    return () => {
      clearInterval(siren);
      clearInterval(flash);
      document.title = original;
    };
  }, [openCount]);

  const act = useCallback(
    (fn: (id: string) => Promise<AlertItem>) => async (id: string) => {
      const updated = await fn(id);
      setAlerts((list) => (updated.status === 'RESOLVED' ? list.filter((a) => a.id !== id) : list.map((a) => (a.id === id ? updated : a))));
    },
    [],
  );

  const value = useMemo<AlertsValue>(
    () => ({ alerts, openCount, ack: act(api.alerts.ack), resolve: act(api.alerts.resolve), refresh }),
    [alerts, openCount, act, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
