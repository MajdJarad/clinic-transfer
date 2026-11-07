/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useMapConfig } from '../config';
import { useI18n } from '../i18n';
import { tripStatusKeys } from '../labels';
import { isOpenTrip } from '../lib/tripFlow';
import type { Trip } from '../types';
import { TripBar } from '../features/map/components/TripBar';
import { toInputValue } from '../lib/date';
import { copyText } from '../features/map/clipboard';
import { DirectionsPanel, type DepartState } from '../features/map/components/DirectionsPanel';
import { ExploreBar } from '../features/map/components/ExploreBar';
import { MapControls, type LayerKey, type MapTypeKey } from '../features/map/components/MapControls';
import { PlaceCard, type MapPick } from '../features/map/components/PlaceCard';
import { createHtmlMarker, pinHtml } from '../features/map/googleMaps';
import { NavigationScreen, unlockSpeech, type NavTarget } from '../features/map/NavigationScreen';
import type { LatLng, RouteData } from '../features/map/routeNav';
import { openStreetView, useGoogleMap, useMapLayers } from '../features/map/useGoogleMap';
import { useRoutes } from '../features/map/useRoutes';
import { useWaypoints, type Place } from '../features/map/useWaypoints';

const toPath = (r: RouteData): LatLng[] => r.geometry.coordinates.map((c) => ({ lat: c[1], lng: c[0] }));
const num = (v: string | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

function placeFromParams(sp: URLSearchParams, label: string, lat: string, lng: string): Place {
  const la = num(sp.get(lat));
  const ln = num(sp.get(lng));
  return { label: sp.get(label) ?? '', coord: la != null && ln != null ? { lat: la, lng: ln } : null };
}

/**
 * The map screen. Like Google Maps it opens in "explore" (search, tap a place, see its card) and
 * switches to "directions" (route options, steps, in-app turn-by-turn navigation).
 * It only wires state together: the pieces live in features/map.
 */
export interface MapScreenProps {
  /** Size/shape of the map box. Default: the admin layout. */
  className?: string;
  /**
   * The driver's trip. The driver's start is always their real position and the target is the patient
   * until pick-up, then the destination. Never shows or needs the patient's phone number.
   */
  trip?: Trip | null;
  /** The driver sets off ("Go"): the trip goes on the way. Every later status follows the car's position. */
  onStartTrip?: (trip: Trip) => Promise<void>;
}

const NO_PARAMS = new URLSearchParams();

/** The admin / coordinator map page. */
export function MapPage() {
  return <MapScreen />;
}

export function MapScreen({ className, trip: driverTrip, onStartTrip }: MapScreenProps = {}) {
  const mapConfig = useMapConfig();
  const { t } = useI18n();
  const [urlParams] = useSearchParams();
  const driverMode = Boolean(onStartTrip);
  // A driver's screen is driven by the trip prop, not by the address bar.
  const searchParams = driverMode ? NO_PARAMS : urlParams;

  const initialFrom = placeFromParams(searchParams, 'origin', 'origLat', 'origLng');
  const initialTo = placeFromParams(searchParams, 'destination', 'destLat', 'destLng');
  const opensWithTrip = Boolean(initialFrom.label || initialFrom.coord || initialTo.label || initialTo.coord) || (driverMode && !!driverTrip && isOpenTrip(driverTrip.status));

  const [view, setView] = useState<'explore' | 'directions'>(opensWithTrip ? 'directions' : 'explore');
  const wp = useWaypoints(initialFrom, initialTo);
  const { from, to } = wp;
  const [searchText, setSearchText] = useState('');

  // Transfer meta info (when launched from a calendar trip)
  const trip = {
    patientName: searchParams.get('patient') || '',
    patientPhone: searchParams.get('phone') || '',
    driverName: searchParams.get('driver') || '',
  };

  // ── Route request
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving');
  const [avoid, setAvoid] = useState({ tolls: false, highways: false, ferries: false });
  const [depart, setDepart] = useState<DepartState>(() => {
    const d = searchParams.get('depart') ? new Date(searchParams.get('depart')!) : null;
    return d && !isNaN(+d) && +d > Date.now() ? { mode: 'later', local: toInputValue(d) } : { mode: 'now', local: '' };
  });
  const departDate = depart.mode === 'later' && depart.local ? new Date(depart.local) : null;
  const departValid = !!departDate && !isNaN(+departDate);
  const departPast = departValid && +departDate! <= Date.now() + 30_000;
  const departAt = departValid && !departPast ? departDate!.toISOString() : undefined;

  const [selected, setSelected] = useState(0);
  // A running navigation is a snapshot: it must not change or vanish when the planning screen behind it does.
  const [nav, setNav] = useState<{ route: RouteData; destination: NavTarget; mode: 'driving' | 'walking'; avoid: { tolls: boolean; highways: boolean; ferries: boolean } } | null>(null);
  const navOpen = nav !== null;
  const { routes, loading: calculating, error: routeError, retryable, retry } = useRoutes(
    view === 'directions' ? from.coord : null,
    view === 'directions' ? to.coord : null,
    { mode: travelMode, avoidTolls: avoid.tolls, avoidHighways: avoid.highways, avoidFerries: avoid.ferries, departAt },
  );
  const route = routes[selected] ?? null;

  // ── Map UI state
  const [mapType, setMapType] = useState<MapTypeKey>('roadmap');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ traffic: false, transit: false, bicycling: false });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [picked, setPicked] = useState<MapPick | null>(null); // a tapped point / chosen search result
  const [myPos, setMyPos] = useState<{ coord: LatLng; accuracy: number } | null>(null);
  const [fly, setFly] = useState<LatLng | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);
  const pickSeq = useRef(0);

  const flash = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500);
  };

  // Tap on the map -> its address -> a place card (like Google Maps)
  const onMapClick = async (lat: number, lng: number) => {
    const mine = ++pickSeq.current;
    setPicked({ coord: { lat, lng }, label: '', loading: true });
    try {
      const r = await api.geo.reverse(lat, lng);
      if (mine === pickSeq.current) setPicked({ coord: { lat, lng }, label: r.label, loading: false });
    } catch {
      if (mine === pickSeq.current) setPicked({ coord: { lat, lng }, label: `الموقع المحدد (${lat.toFixed(5)}, ${lng.toFixed(5)})`, loading: false });
    }
  };

  const gm = useGoogleMap({
    center: from.coord ?? mapConfig.defaultCenter,
    zoom: mapConfig.defaultZoom,
    disableDefaultUI: true,
    onClick: onMapClick,
  });
  const { mapRef, gRef, ready } = gm;
  useMapLayers(gm, layers);

  // ── Driver trip: start from where the driver really is; the target depends on the stage of the trip
  // (patient before pick-up, destination after). Saved coordinates are used; for older trips the address
  // is looked up; nothing is ever replaced by made-up coordinates.
  useEffect(() => {
    if (!driverTrip || !isOpenTrip(driverTrip.status)) return;
    const dropoff = driverTrip.status === 'PICKED_UP';
    const label = dropoff ? driverTrip.destination : driverTrip.origin;
    const lat = dropoff ? driverTrip.destLat : driverTrip.originLat;
    const lng = dropoff ? driverTrip.destLng : driverTrip.originLng;
    setView('directions');
    if (lat != null && lng != null) wp.setPlace('to', { label, coord: { lat, lng } });
    else void wp.resolve('to', label);
    wp.useMyLocation('from'); // the driver may have moved on since the last stage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverTrip?.id, driverTrip?.status]);

  // ── Sync with the URL when it changes (opened again from another calendar trip), and locate
  // addresses that arrive without coordinates. Only touches state when something differs.
  useEffect(() => {
    if (driverMode) return;
    const f = placeFromParams(searchParams, 'origin', 'origLat', 'origLng');
    const t = placeFromParams(searchParams, 'destination', 'destLat', 'destLng');
    const apply = (target: 'from' | 'to', next: Place, cur: Place) => {
      if (!next.label && !next.coord) return;
      const same = next.label === cur.label && next.coord?.lat === cur.coord?.lat && next.coord?.lng === cur.coord?.lng;
      if (next.coord && !same) wp.setPlace(target, { label: next.label || cur.label, coord: next.coord });
      else if (!next.coord && next.label && (next.label !== cur.label || !cur.coord)) void wp.resolve(target, next.label);
    };
    apply('from', f, from);
    apply('to', t, to);
    if (f.label || f.coord || t.label || t.coord) setView('directions');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Base map type, resize after fullscreen, fly to a searched place
  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType);
  }, [ready, mapType, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    const id = setTimeout(() => g.maps.event.trigger(map, 'resize'), 50);
    return () => clearTimeout(id);
  }, [isFullscreen, ready, mapRef, gRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly) return;
    map.panTo(fly);
    if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
  }, [fly, mapRef]);

  useEffect(() => {
    setSelected(0);
  }, [routes]);

  // ── Markers: A/B pins (directions), the tapped point, my position
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || view !== 'directions') return;
    const overlays: any[] = [];
    if (from.coord) overlays.push(createHtmlMarker(g, from.coord, pinHtml('#137333', from.label || 'نقطة الانطلاق', 'A')));
    if (to.coord) overlays.push(createHtmlMarker(g, to.coord, pinHtml('#d93025', to.label || 'الوجهة', 'B')));
    overlays.forEach((o) => o.setMap(map));
    return () => overlays.forEach((o) => o.setMap(null));
  }, [ready, view, from, to, mapRef, gRef]);

  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || !picked) return;
    const m = createHtmlMarker(
      g,
      picked.coord,
      view === 'explore'
        ? pinHtml('#d93025', '', undefined)
        : `<div style="width:18px;height:18px;border-radius:50%;background:#5f6368;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
      undefined,
      view === 'explore' ? 'bottom' : 'center',
    );
    m.setMap(map);
    return () => m.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, picked?.coord.lat, picked?.coord.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || !myPos) return;
    const dot = createHtmlMarker(
      g,
      myPos.coord,
      `<div style="width:18px;height:18px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,.25)"></div>`,
      undefined,
      'center',
    );
    dot.setMap(map);
    const circle = new g.maps.Circle({ center: myPos.coord, radius: Math.min(myPos.accuracy, 500), strokeOpacity: 0, fillColor: '#1a73e8', fillOpacity: 0.12, map });
    return () => {
      dot.setMap(null);
      circle.setMap(null);
    };
  }, [ready, myPos, mapRef, gRef]);

  // ── Route lines: alternatives (light, clickable) and the selected one (with traffic colors)
  useEffect(() => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g || view !== 'directions' || !routes.length) return;
    const overlays: any[] = [];
    routes.forEach((r, i) => {
      if (i === selected) return;
      const alt = new g.maps.Polyline({ path: toPath(r), strokeColor: '#8ab4f8', strokeOpacity: 0.95, strokeWeight: 6, zIndex: 1, map });
      alt.addListener('click', () => setSelected(i));
      overlays.push(alt);
    });
    const r = routes[selected];
    if (r) {
      const path = toPath(r);
      overlays.push(new g.maps.Polyline({ path, strokeColor: '#1557bf', strokeOpacity: 0.95, strokeWeight: 9, zIndex: 2, map }));
      overlays.push(new g.maps.Polyline({ path, strokeColor: '#1a73e8', strokeOpacity: 1, strokeWeight: 6, zIndex: 3, map }));
      r.traffic.forEach((t) =>
        overlays.push(
          new g.maps.Polyline({ path: path.slice(t.from, t.to + 1), strokeColor: t.speed === 'TRAFFIC_JAM' ? '#d93025' : '#f9ab00', strokeOpacity: 1, strokeWeight: 6, zIndex: 4, map }),
        ),
      );
    }
    return () => overlays.forEach((o) => o.setMap(null));
  }, [ready, view, routes, selected, mapRef, gRef]);

  const fitRoutes = () => {
    const map = mapRef.current;
    const g = gRef.current;
    if (!map || !g) return;
    const bounds = new g.maps.LatLngBounds();
    routes.forEach((r) => toPath(r).forEach((p) => bounds.extend(p)));
    if (!routes.length) {
      if (from.coord) bounds.extend(from.coord);
      if (to.coord) bounds.extend(to.coord);
    }
    if (bounds.isEmpty()) return;
    // On phones the directions card covers the top of the map: leave room for it.
    const top = window.innerWidth < 640 ? 320 : 100;
    map.fitBounds(bounds, { top, right: 100, bottom: 100, left: 100 });
  };
  useEffect(() => {
    if (view === 'directions') fitRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, routes, from.coord, to.coord]);

  // ── Actions
  const openDirections = () => {
    if (picked) wp.setPlace('to', { label: picked.label, coord: picked.coord });
    setPicked(null);
    setView('directions');
    if (!from.coord) wp.useMyLocation('from');
  };

  const useAs = (target: 'from' | 'to') => {
    if (!picked) return;
    wp.setPlace(target, { label: picked.label, coord: picked.coord });
    setPicked(null);
  };

  const locateMe = () => {
    if (!('geolocation' in navigator)) return flash('المتصفح لا يدعم تحديد الموقع');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos({ coord, accuracy: pos.coords.accuracy });
        mapRef.current?.panTo(coord);
        mapRef.current?.setZoom(15);
      },
      (err) => flash(err.code === err.PERMISSION_DENIED ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.' : 'تعذّر تحديد موقعك الحالي'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  };

  const streetViewHere = async () => {
    const c = mapRef.current?.getCenter();
    const at = picked?.coord ?? (c ? { lat: c.lat(), lng: c.lng() } : null);
    if (!at) return;
    if (!(await openStreetView(gm, at))) flash('لا تتوفر صور شارع قريبة من هذا المكان');
  };

  const copyPlace = async () => {
    if (!picked) return;
    const ok = await copyText(`${picked.label}\nhttps://www.google.com/maps?q=${picked.coord.lat},${picked.coord.lng}`);
    flash(ok ? 'تم نسخ رابط الموقع' : 'تعذّر النسخ');
  };

  // A link that reopens this exact route (also the format the calendar uses to open the map)
  const shareRoute = async () => {
    if (!from.coord || !to.coord) return;
    const p = new URLSearchParams({
      origin: from.label,
      origLat: String(from.coord.lat),
      origLng: String(from.coord.lng),
      destination: to.label,
      destLat: String(to.coord.lat),
      destLng: String(to.coord.lng),
    });
    if (departAt) p.set('depart', departAt);
    const ok = await copyText(`${window.location.origin}/map?${p}`);
    flash(ok ? 'تم نسخ رابط المسار' : 'تعذّر النسخ');
  };

  // At arrival the driver can tell the patient the car is here without ever seeing the number (the server
  // sends it). The trip's status is not tapped: it follows the car's position.
  const secondaryAction =
    driverTrip && driverMode && ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(driverTrip.status)
      ? {
          label: '📨 إشعار المريض بوصول السيارة',
          run: async () => {
            const r = await api.trips.notifyPatient(driverTrip.id);
            return r.status === 'requested' ? '✓ أُبلغ المنسق ليرسل الرسالة للمريض' : '✓ أُرسلت الرسالة للمريض';
          },
        }
      : undefined;

  const canStart = !!route && !calculating && !wp.fromDirty && !wp.toDirty && !!from.coord && !!to.coord;
  const startHint = calculating
    ? 'جارٍ حساب المسار…'
    : wp.fromDirty || wp.toDirty
      ? 'اختر الأماكن من قائمة الاقتراحات'
      : !from.coord || !to.coord
        ? 'حدّد نقطة الانطلاق والوجهة'
        : routeError;

  // Start navigating. For a driver this is "Go": setting off towards the patient puts the trip on the way.
  const beginNavigation = async () => {
    unlockSpeech();
    if (driverTrip?.status === 'ASSIGNED' && onStartTrip) {
      try {
        await onStartTrip(driverTrip);
      } catch {
        /* navigation must not be blocked by a failed status update */
      }
    }
    if (route && to.coord) setNav({ route, destination: { label: to.label, coord: to.coord }, mode: travelMode, avoid });
  };

  return (
    <div
      className={`w-full overflow-hidden bg-slate-900 ${
        // (not "relative" while full screen: it would override "fixed")
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : `relative rounded-2xl ${className ?? 'h-[calc(100dvh-10rem)] sm:h-[calc(100vh-6.5rem)]'}`
      }`}
    >
      <div ref={gm.divRef} className="z-0 h-full w-full" />
      {(gm.keyMissing || gm.error) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface2 p-6 text-center text-sm text-muted">
          <p className="font-medium text-fg">{gm.error ? `تعذّر تحميل خريطة Google: ${gm.error}` : 'خريطة Google غير مفعّلة بعد'}</p>
          {gm.keyMissing && <p>أضف مفتاح Google Maps في GOOGLE_MAPS_API_KEY على السيرفر ليعمل البحث والمسار.</p>}
        </div>
      )}

      {/* Search (explore) or directions */}
      <div className="absolute inset-x-2 top-2.5 z-30 flex max-w-full flex-col gap-2 sm:inset-x-auto sm:start-4 sm:top-4 sm:w-80 md:w-96">
        {view === 'explore' ? (
          <ExploreBar
            value={searchText}
            onChange={setSearchText}
            onPick={(pl) => {
              const coord = { lat: pl.lat, lng: pl.lng };
              setSearchText(pl.label);
              setPicked({ coord, label: pl.label, loading: false });
              setFly(coord);
            }}
            onClear={() => {
              setSearchText('');
              setPicked(null);
            }}
            onDirections={openDirections}
          />
        ) : (
          <DirectionsPanel
            wp={wp}
            travelMode={travelMode}
            onTravelMode={setTravelMode}
            routes={routes}
            selected={selected}
            onSelect={setSelected}
            calculating={calculating}
            routeError={routeError}
            retryable={retryable}
            onRetry={retry}
            avoid={avoid}
            onAvoid={setAvoid}
            depart={depart}
            onDepart={setDepart}
            departPast={departPast}
            canStart={canStart}
            startHint={startHint}
            onStart={beginNavigation}
            onShare={shareRoute}
            onBack={() => setView('explore')}
            trip={trip}
            tripSlot={
              driverTrip && driverMode && isOpenTrip(driverTrip.status) ? (
                <TripBar trip={driverTrip} onGo={beginNavigation} canGo={canStart} statusLabel={t(tripStatusKeys[driverTrip.status])} />
              ) : undefined
            }
          />
        )}
      </div>

      {notice && (
        <div className="absolute inset-x-0 top-20 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-2xl sm:top-4" role="status" data-testid="notice">
          {notice}
        </div>
      )}

      <MapControls
        ready={ready}
        mapType={mapType}
        onMapType={setMapType}
        layers={layers}
        onToggleLayer={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))}
        onLocate={locateMe}
        onFit={fitRoutes}
        onStreetView={streetViewHere}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onZoom={(d) => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 12) + d)}
      />

      {picked && !navOpen && (
        <PlaceCard
          place={picked}
          view={view}
          onClose={() => setPicked(null)}
          onDirections={openDirections}
          onUseAsDestination={() => useAs('to')}
          onUseAsStart={() => useAs('from')}
          onStreetView={streetViewHere}
          onCopy={copyPlace}
        />
      )}

      {/* In-app turn-by-turn navigation */}
      {nav && (
        <NavigationScreen
          destination={nav.destination}
          mode={nav.mode}
          route={nav.route}
          avoid={nav.avoid}
          secondaryAction={secondaryAction}
          onExit={() => setNav(null)}
        />
      )}
    </div>
  );
}
