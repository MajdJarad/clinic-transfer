import { useRef, useState } from 'react';
import { resolveAddress } from './resolveAddress';
import type { LatLng } from './routeNav';

export interface Place {
  label: string;
  coord: LatLng | null;
}

type Target = 'from' | 'to';

/**
 * State of the two waypoints shared by every screen with a search box pair.
 * `*Text` is what is typed; `from`/`to` are the resolved places. When they differ the text was
 * edited without choosing a suggestion ("dirty"), and navigation must not start from stale coordinates.
 */
export function useWaypoints(initialFrom: Place, initialTo: Place) {
  const [from, setFrom] = useState<Place>(initialFrom);
  const [to, setTo] = useState<Place>(initialTo);
  const [fromText, setFromText] = useState(initialFrom.label);
  const [toText, setToText] = useState(initialTo.label);
  const [fromIsGps, setFromIsGps] = useState(false);
  const [toIsGps, setToIsGps] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');

  // Guards async address lookups: a newer choice for the same waypoint invalidates a pending one.
  const seq = useRef({ from: 0, to: 0 });

  const apply = (target: Target, place: Place, gps: boolean) => {
    if (target === 'from') {
      setFrom(place);
      setFromText(place.label);
      setFromIsGps(gps);
    } else {
      setTo(place);
      setToText(place.label);
      setToIsGps(gps);
    }
  };

  /** Set a resolved place (from a suggestion, a map tap, a trip, or the GPS). */
  const setPlace = (target: Target, place: Place, gps = false) => {
    seq.current[target]++;
    apply(target, place, gps);
  };

  /**
   * Show an address that has no coordinates yet (e.g. a trip created from free text) and try to
   * locate it. Never guesses: if Google finds nothing the place stays unresolved (coord null).
   */
  const resolve = async (target: Target, label: string) => {
    const mine = ++seq.current[target];
    apply(target, { label, coord: null }, false);
    const found = await resolveAddress(label);
    if (found && mine === seq.current[target]) apply(target, { label, coord: found }, false);
  };

  const setText = (target: Target, text: string) => (target === 'from' ? setFromText(text) : setToText(text));
  const clear = (target: Target) => setPlace(target, { label: '', coord: null });

  const swap = () => {
    setFrom(to);
    setTo(from);
    setFromText(to.label);
    setToText(from.label);
    setFromIsGps(toIsGps);
    setToIsGps(fromIsGps);
  };

  /** Use the device position for one of the waypoints. */
  const useMyLocation = (target: Target) => {
    setGeoMsg('');
    if (!('geolocation' in navigator)) {
      setGeoMsg('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setGeoMsg('جارٍ تحديد موقعك…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoMsg('');
        setPlace(target, { label: 'موقعي الحالي', coord: { lat: pos.coords.latitude, lng: pos.coords.longitude } }, true);
      },
      (err) =>
        setGeoMsg(err.code === err.PERMISSION_DENIED ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.' : 'تعذّر تحديد موقعك الحالي'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  };

  return {
    from,
    to,
    fromText,
    toText,
    fromIsGps,
    toIsGps,
    fromDirty: fromText !== from.label,
    toDirty: toText !== to.label,
    geoMsg,
    setGeoMsg,
    setPlace,
    resolve,
    setText,
    clear,
    swap,
    useMyLocation,
  };
}
