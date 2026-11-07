/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { haversine } from '../map/routeNav';

export type SharingState = 'off' | 'starting' | 'live' | 'denied' | 'unavailable' | 'error';

const MIN_GAP_MS = 4000; // moving: at most one report every 4 s
const HEARTBEAT_MS = 15000; // standing still: still report this often, so the driver stays "live" (a stationary phone emits no new fixes)
const MOVED_M = 15; // moved this far => report as soon as the minimum gap allows
const TICK_MS = 1500; // how often we look at the latest fix and decide

/**
 * Continuously reports the phone's position (browser geolocation, i.e. the device's own GPS/Google
 * location services) to the server, so coordinators see the driver live and the trip status can follow
 * the car. It starts by itself while the driver app is open and there is no switch to turn it off: the
 * driver is always visible, on a trip or not. A web page can only do this while it is open and the
 * screen is on, so a wake lock keeps the screen awake.
 */
export function useLocationSharing(driverId: string | null | undefined, onTripUpdate?: () => void) {
  const [state, setState] = useState<SharingState>('off');
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const inFlight = useRef(false);
  const onUpdate = useRef(onTripUpdate);
  onUpdate.current = onTripUpdate;

  useEffect(() => {
    if (!driverId) {
      setState('off');
      return;
    }
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      setState('unavailable');
      return;
    }
    setState('starting');
    let alive = true;
    // The newest fix is kept, and a short timer decides what to send. This way a fix that arrives too soon
    // after the last report is not lost (it goes out on the next tick), and a phone that stands still keeps
    // reporting from its last known position.
    let latest: GeolocationPosition | null = null;

    const send = async (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, heading, speed, accuracy } = pos.coords;
      inFlight.current = true;
      try {
        const reply = await api.drivers.sendLocation(driverId, {
          lat,
          lng,
          heading: heading != null && Number.isFinite(heading) && (speed ?? 0) > 0.5 ? heading : null,
          speed: speed != null && Number.isFinite(speed) ? speed : null,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
        });
        last.current = { at: Date.now(), lat, lng };
        // The server moved a trip along (arrived / picked up / completed): refresh the screen at once.
        if (alive && reply?.tripUpdate) onUpdate.current?.();
        if (alive) {
          setLastSentAt(Date.now());
          setState('live');
        }
      } catch {
        // Offline or the server refused it: the next tick tries again (last.current is not advanced).
        // Say so: a phone that "looks fine" while nothing reaches the clinic is the worst case.
        if (alive) setState('error');
      } finally {
        inFlight.current = false;
      }
    };

    const decide = () => {
      if (!latest || inFlight.current) return;
      const prev = last.current;
      const gap = prev ? Date.now() - prev.at : Infinity;
      const moved = prev ? haversine({ lat: prev.lat, lng: prev.lng }, { lat: latest.coords.latitude, lng: latest.coords.longitude }) : Infinity;
      if ((moved >= MOVED_M && gap >= MIN_GAP_MS) || gap >= HEARTBEAT_MS) void send(latest);
    };

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        latest = pos;
        decide(); // the first fix, or a move after a quiet spell, goes out immediately
      },
      (err) => alive && setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'starting'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
    const tick = window.setInterval(decide, TICK_MS);

    // Keep the screen on while sharing (and again after the app was in the background).
    let lock: any = null;
    const keepAwake = () => {
      if (document.visibilityState !== 'visible') return;
      (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {});
    };
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);

    return () => {
      alive = false;
      clearInterval(tick);
      navigator.geolocation.clearWatch(id);
      document.removeEventListener('visibilitychange', keepAwake);
      lock?.release?.().catch?.(() => {});
    };
  }, [driverId]);

  return { state, lastSentAt };
}
