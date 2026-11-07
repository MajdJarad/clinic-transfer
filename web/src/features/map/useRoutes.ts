import { useEffect, useState } from 'react';
import { api } from '../../api';
import { haversine, type LatLng, type RouteData } from './routeNav';

export interface RouteRequest {
  mode: 'driving' | 'walking';
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  /** ISO time of a planned departure (traffic is estimated for it); omit for "leave now". */
  departAt?: string;
}

export const NO_AVOID = { avoidTolls: false, avoidHighways: false, avoidFerries: false } as const;

/**
 * Routes (with alternatives, steps and traffic) between two points.
 * Re-requests only when a coordinate or option actually changes, not on object identity.
 */
export function useRoutes(from: LatLng | null, to: LatLng | null, req: RouteRequest) {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(true);
  const [nonce, setNonce] = useState(0);

  const { mode, avoidTolls, avoidHighways, avoidFerries, departAt } = req;
  const [fLat, fLng, tLat, tLng] = [from?.lat, from?.lng, to?.lat, to?.lng];

  useEffect(() => {
    setRoutes([]);
    setError('');
    if (fLat == null || fLng == null || tLat == null || tLng == null) {
      setLoading(false);
      return;
    }
    if (haversine({ lat: fLat, lng: fLng }, { lat: tLat, lng: tLng }) < 20) {
      setError('نقطة الانطلاق والوجهة متطابقتان تقريباً');
      setRetryable(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.geo
      .route({ lat: fLat, lng: fLng }, { lat: tLat, lng: tLng }, { mode, alternatives: true, avoidTolls, avoidHighways, avoidFerries, departureTime: departAt })
      .then((res) => !cancelled && setRoutes(res.routes?.length ? res.routes : [res]))
      .catch((e: Error) => {
        if (cancelled) return;
        const none = /No route/i.test(e.message);
        setRetryable(!none);
        setError(none ? 'لا يوجد مسار بين النقطتين' : 'تعذّر حساب المسار. تحقق من الاتصال وحاول مرة أخرى.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fLat, fLng, tLat, tLng, mode, avoidTolls, avoidHighways, avoidFerries, departAt, nonce]);

  return { routes, loading, error, retryable, retry: () => setNonce((n) => n + 1) };
}
