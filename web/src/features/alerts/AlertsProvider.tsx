/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { api } from '../../api';
import type { AlertItem } from '../../types';
import { alertTypeLabel } from './labels';
import { audioReady, enableAudio, startAlarm, stopAlarm, unlockAudioOnFirstTouch } from './siren';

const POLL_MS = 4000;

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
 * Watches for driver alerts everywhere in the coordinator's app (polls every few seconds, even when the tab
 * is in the background). While any alert is still unclaimed it is impossible to miss: a loud continuous
 * siren, the whole screen pulsing red, the phone vibrating, the screen kept awake, a system notification for a
 * new alert and the tab title flashing. Taking the alert over (or the mute button) quiets the sound.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false); // the browser has not yet allowed sound

  const refresh = useCallback(() => {
    api.alerts
      .list()
      .then((list) => {
        const fresh = list.filter((a) => a.status === 'OPEN' && !seen.current.has(a.id));
        // A new alert always sounds again, even if the previous one had been muted. Alerts already there when
        // the page opened keep the siren going (below) but do not raise a second system notification.
        if (fresh.length && !first.current) {
          setMuted(false);
          notifyNew(fresh[0]);
        }
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

  // While something is unclaimed: siren (unless muted), vibration, screen kept awake, flashing tab title.
  useEffect(() => {
    if (!openCount) return;
    const original = document.title;
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      document.title = on ? `إنذار عاجل (${openCount})` : original;
    }, 800);
    let lock: any = null;
    const keepAwake = () => (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {});
    void keepAwake();
    const onVisible = () => document.visibilityState === 'visible' && void keepAwake();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(flash);
      document.title = original;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch?.(() => {});
    };
  }, [openCount]);

  useEffect(() => {
    if (!openCount || muted) {
      stopAlarm();
      return;
    }
    startAlarm();
    const vibrate = () => (navigator as any).vibrate?.([700, 250, 700, 250, 700]);
    vibrate();
    const v = setInterval(vibrate, 3200);
    const check = setInterval(() => setBlocked(!audioReady()), 800);
    return () => {
      clearInterval(v);
      clearInterval(check);
    };
  }, [openCount, muted]);
  useEffect(() => () => stopAlarm(), []);

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
  return (
    <Ctx.Provider value={value}>
      {children}
      {openCount > 0 && (
        <>
          {/* The whole screen pulses red (never blocks a tap). */}
          <div aria-hidden className="alarm-flash pointer-events-none fixed inset-0 z-[80]" data-testid="alarm-flash" />
          <div className="fixed inset-x-0 bottom-24 z-[85] flex justify-center md:bottom-6" data-testid="alarm-controls">
            {blocked && !muted ? (
              <button type="button" onClick={enableAudio} className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white shadow-float" data-testid="alarm-enable">
                <Icon name="volume" inline /> اضغط هنا لتفعيل صوت الإنذار
              </button>
            ) : muted ? (
              <button type="button" onClick={() => setMuted(false)} className="rounded-full bg-surface px-5 py-3 text-sm font-medium text-fg shadow-float" data-testid="alarm-unmute">
                <Icon name="volume" inline /> تشغيل صوت الإنذار
              </button>
            ) : (
              <button type="button" onClick={() => setMuted(true)} className="rounded-full bg-surface px-5 py-3 text-sm font-medium text-fg shadow-float" data-testid="alarm-mute">
                <Icon name="volume-off" inline /> كتم الصوت
              </button>
            )}
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}

/** A system notification (when the person allowed it), so a new alert reaches them outside the tab too. */
function notifyNew(a: AlertItem) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('إنذار عاجل من سائق', {
      body: `${alertTypeLabel(a.type)} • ${a.driver.name}${a.driver.vehicle ? ` • ${a.driver.vehicle.plate}` : ''}`,
      tag: 'driver-alert',
      requireInteraction: true,
      ...({ vibrate: [700, 250, 700, 250, 700], renotify: true } as object),
    });
  } catch {
    /* not supported here */
  }
}
