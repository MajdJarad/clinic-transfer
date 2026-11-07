import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useMapConfig } from '../config';
import { MapView, type MapPoint } from '../features/map/MapView';
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from '../features/map/googleMaps';
import { NavigationScreen } from '../features/map/NavigationScreen';
import { PlaceInput } from '../features/map/PlaceInput';
import { formatDistance, formatDuration } from '../features/map/routeNav';
import { NO_AVOID, useRoutes } from '../features/map/useRoutes';
import { useWaypoints } from '../features/map/useWaypoints';
import { WhatsAppModal } from '../components/WhatsAppModal';
import { ThemeToggle } from '../components/Controls';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Modal,
  Select,
  StatusPill,
  Textarea,
} from '../components/ui';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';
import { TripDetailModal } from '../components/trips/TripDetailModal';
import { driverStatusKeys, tripStatusKeys } from '../labels';
import {
  addDays,
  addMonths,
  formatMonthYear,
  formatRangeLabel,
  startOfDay,
  startOfWeek,
} from '../lib/date';
import type { Driver, Maintenance, Trip, TripStatus } from '../types';

type DriverTab = 'calendar' | 'navigation' | 'maintenance';
type ViewMode = 'day' | 'week' | 'month';

const NEXT_ACTION: Partial<Record<TripStatus, { label: string; status: TripStatus; variant: 'primary' | 'success' | 'secondary' }>> = {
  ASSIGNED: { label: 'انطلاق في الطريق 🚗', status: 'EN_ROUTE', variant: 'primary' },
  EN_ROUTE: { label: 'وصلت إلى الموقع 📍', status: 'ARRIVED', variant: 'primary' },
  ARRIVED: { label: 'صعد المريض 👤', status: 'PICKED_UP', variant: 'success' },
  PICKED_UP: { label: 'إنهاء الرحلة بنجاح ✓', status: 'COMPLETED', variant: 'success' },
};

const ACTIVE_STATUSES: TripStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP'];

export function DriverApp() {
  const { user, logout } = useAuth();
  const { t, intl } = useI18n();
  const mapConfig = useMapConfig();
  const driverId = user?.driverId ?? '';

  // Active Tab
  const [activeTab, setActiveTab] = useState<DriverTab>('calendar');

  // Driver & Trips State
  const [driver, setDriver] = useState<Driver | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [waTrip, setWaTrip] = useState<Trip | null>(null);

  // ─── Google Calendar State (Exact as Admin/Coordinator) ───
  const [calView, setCalView] = useState<ViewMode>('day');
  const [calAnchor, setCalAnchor] = useState<Date>(() => new Date());
  const [calDetailTrip, setCalDetailTrip] = useState<Trip | null>(null);
  const [calQuery, setCalQuery] = useState('');

  // ─── Google Maps Navigation State (Fully Editable Waypoints) ───
  const wp = useWaypoints(
    { label: DEFAULT_ORIGIN.label, coord: DEFAULT_ORIGIN.coord },
    { label: DEFAULT_DESTINATION.label, coord: DEFAULT_DESTINATION.coord },
  );
  const { from, to, fromIsGps, fromDirty, toDirty } = wp;
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving');
  const [selRoute, setSelRoute] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const {
    routes,
    loading: calculatingRoute,
    error: routeError,
    retryable,
    retry: retryRoute,
  } = useRoutes(from.coord, to.coord, { mode: travelMode, ...NO_AVOID });
  const navRoute = routes[selRoute] ?? null; // the chosen route, with its turn-by-turn steps
  useEffect(() => setSelRoute(0), [routes]);

  // ─── Maintenance State ───
  const [maintenanceRecords, setMaintenanceRecords] = useState<Maintenance[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    type: 'REPAIR',
    title: '',
    description: '',
    odometer: '',
  });
  const [reportError, setReportError] = useState('');

  // ─── Location & Sharing State ───
  const [sharing, setSharing] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const watchRef = useRef<number | null>(null);

  // Load Driver Data
  const loadDriver = useCallback(() => {
    if (!driverId) return;
    api.drivers.me(driverId).then(setDriver).catch(() => {});
    api.trips.mine().then((data) => {
      setTrips(data);
      if (data.length > 0 && !selectedTrip) {
        const current = data.find((tr) => ACTIVE_STATUSES.includes(tr.status)) ?? data[0];
        setSelectedTrip(current);
        if (current) loadTripIntoNav(current);
      }
    }).catch(() => {});
  }, [driverId]);

  // Load Maintenance Records
  const loadMaintenance = useCallback(() => {
    setMaintenanceLoading(true);
    api.maintenance
      .list()
      .then(setMaintenanceRecords)
      .catch(() => {})
      .finally(() => setMaintenanceLoading(false));
  }, []);

  useEffect(() => {
    loadDriver();
    loadMaintenance();
  }, [loadDriver, loadMaintenance]);

  // ─── Calendar Calculations ───
  const calDays = useMemo(() => {
    if (calView === 'day') return [startOfDay(calAnchor)];
    if (calView === 'week') {
      const s = startOfWeek(calAnchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    return [];
  }, [calView, calAnchor]);

  const calTitle = useMemo(() => {
    if (calView === 'month') return formatMonthYear(calAnchor, intl);
    if (calView === 'week') return formatRangeLabel(calDays[0], addDays(calDays[6], 0), intl);
    return calDays[0]?.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) ?? '';
  }, [calView, calAnchor, calDays, intl]);

  const navCal = (dir: number) => {
    if (calView === 'month') setCalAnchor((a) => addMonths(a, dir));
    else if (calView === 'week') setCalAnchor((a) => addDays(a, dir * 7));
    else setCalAnchor((a) => addDays(a, dir));
  };

  const colorFor = useCallback((trip: Trip) => {
    if (trip.status === 'COMPLETED') return '#059669'; // Green
    if (trip.status === 'EN_ROUTE' || trip.status === 'ARRIVED') return '#2563eb'; // Blue
    if (trip.status === 'CANCELLED') return '#9ca3af'; // Gray
    return '#d97706'; // Amber for scheduled / assigned
  }, []);

  const visibleCalTrips = useMemo(() => {
    const q = calQuery.trim().toLowerCase();
    return trips.filter((t) => {
      if (!q) return true;
      return (
        t.patientName.toLowerCase().includes(q) ||
        t.patientPhone.toLowerCase().includes(q) ||
        t.origin.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q)
      );
    });
  }, [trips, calQuery]);

  // ─── Show a trip's route in the navigation tab ───
  // Uses the trip's saved coordinates; for older trips saved without them the address is looked up.
  // It never substitutes made-up coordinates for a real address.
  function loadTripIntoNav(tr: Trip) {
    if (tr.originLat != null && tr.originLng != null) wp.setPlace('from', { label: tr.origin, coord: { lat: tr.originLat, lng: tr.originLng } });
    else void wp.resolve('from', tr.origin);
    if (tr.destLat != null && tr.destLng != null) wp.setPlace('to', { label: tr.destination, coord: { lat: tr.destLat, lng: tr.destLng } });
    else void wp.resolve('to', tr.destination);
  }

  // ─── Start Navigation for Trip (Called from Calendar or List) ───
  const startNavForTrip = (tr: Trip) => {
    setSelectedTrip(tr);
    loadTripIntoNav(tr);
    setActiveTab('navigation');
  };

  // ─── Send Position to Server ───
  const sendPosition = useCallback(() => {
    if (!driverId) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          await api.drivers.sendLocation(driverId, latitude, longitude);
          setLocMsg('تم تحديث موقعك بنجاح');
        } catch {
          setLocMsg('تعذر تحديث الموقع');
        }
      },
      () => setLocMsg('يرجى تفعيل خدمة الموقع (GPS)'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [driverId]);

  // Live Location Watcher
  useEffect(() => {
    if (!sharing) {
      if (watchRef.current != null) {
        clearInterval(watchRef.current);
        watchRef.current = null;
      }
      return;
    }
    sendPosition();
    watchRef.current = window.setInterval(sendPosition, 30000);
    return () => {
      if (watchRef.current != null) clearInterval(watchRef.current);
    };
  }, [sharing, sendPosition]);

  // Step Advance Trip
  const advanceTrip = async (tr: Trip) => {
    const action = NEXT_ACTION[tr.status];
    if (!action) return;
    const updated = await api.trips.setStatus(tr.id, action.status);
    setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTrip?.id === updated.id) {
      setSelectedTrip(updated);
    }
    loadDriver();
  };

  // Submit Maintenance / Defect Report
  const submitMaintenance = async () => {
    if (!driver?.vehicle?.id) {
      setReportError('لا توجد سيارة مسندة إليك حالياً لتسجيل الصيانة لها');
      return;
    }
    if (!reportForm.title.trim()) {
      setReportError('يرجى كتابة عنوان العطل أو الصيانة');
      return;
    }
    setReportError('');
    try {
      await api.maintenance.create({
        vehicleId: driver.vehicle.id,
        type: reportForm.type,
        title: reportForm.title,
        description: reportForm.description,
        odometer: reportForm.odometer ? parseInt(reportForm.odometer, 10) : undefined,
        status: 'SCHEDULED',
      });
      setReportModalOpen(false);
      setReportForm({ type: 'REPAIR', title: '', description: '', odometer: '' });
      loadMaintenance();
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'فشل تسجيل العطل');
    }
  };

  // Map Points for Navigation View
  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = [];
    if (from.coord) list.push({ id: 'origin', lat: from.coord.lat, lng: from.coord.lng, title: from.label || 'الانطلاق', color: '#137333' });
    if (to.coord) list.push({ id: 'dest', lat: to.coord.lat, lng: to.coord.lng, title: to.label || 'الوجهة', color: '#d93025' });
    return list;
  }, [from, to]);

  // In-app turn-by-turn navigation (live GPS when the start point is "my location", otherwise a preview)

  return (
    <div className="min-h-screen bg-bg pb-20 md:pb-10">
      {navOpen && navRoute && from.coord && to.coord && (
        <NavigationScreen
          origin={{ label: from.label, coord: from.coord }}
          destination={{ label: to.label, coord: to.coord }}
          mode={travelMode}
          route={navRoute}
          startWithGps={fromIsGps}
          onExit={() => setNavOpen(false)}
        />
      )}
      {/* ─── Driver Top Header ─── */}
      <header className="sticky top-0 z-30 bg-brand-900 px-4 py-3 text-white shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 font-bold text-white shadow-sm">
              🚗
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold">{user?.name}</h1>
              <p className="truncate text-[11px] text-brand-200">
                {driver?.vehicle ? `${driver.vehicle.make} ${driver.vehicle.model} • ${driver.vehicle.plate}` : 'بدون سيارة مسندة'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Read-Only Status Display (Set by Admin/Coordinator) */}
            <span
              className={`rounded-lg px-2.5 py-1 text-xs font-bold border flex items-center gap-1.5 ${
                driver?.status === 'AVAILABLE'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : driver?.status === 'ON_TRIP'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
              }`}
              title="الحالة محددة من قبل الإدارة والمنسق"
            >
              <span className={`h-2 w-2 rounded-full ${
                driver?.status === 'AVAILABLE'
                  ? 'bg-emerald-400 animate-pulse'
                  : driver?.status === 'ON_TRIP'
                  ? 'bg-blue-400'
                  : 'bg-slate-400'
              }`} />
              <span>{driver?.status ? t(driverStatusKeys[driver.status]) : 'متاح'}</span>
            </span>

            <ThemeToggle />
            <button
              onClick={logout}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/90 hover:bg-white/20"
            >
              خروج
            </button>
          </div>
        </div>

        {/* ─── Top Tabs ─── */}
        <div className="mt-2.5 flex gap-2 border-t border-white/10 pt-2">
          {[
            { id: 'calendar', label: 'التقويم', icon: '📅' },
            { id: 'navigation', label: 'الملاحة', icon: '🧭' },
            { id: 'maintenance', label: 'الصيانة والأعطال', icon: '🔧' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as DriverTab)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${
                activeTab === tab.id
                  ? 'bg-white text-brand-900 shadow-md'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ─── Main Views ─── */}
      <main className="p-3 md:p-4 max-w-6xl mx-auto">
        {/* ══════════════════ 1. GOOGLE CALENDAR VIEW (EXACT AS ADMIN) ══════════════════ */}
        {activeTab === 'calendar' && (
          <div className="space-y-3">
            {/* Google Calendar Toolbar */}
            <Card className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Navigation and Date Title */}
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setCalAnchor(new Date())}>
                    اليوم
                  </Button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navCal(-1)}
                      className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg text-base font-bold"
                      aria-label="السابق"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => navCal(1)}
                      className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg text-base font-bold"
                      aria-label="التالي"
                    >
                      ‹
                    </button>
                  </div>
                  <h2 className="text-sm md:text-base font-bold text-fg">{calTitle}</h2>
                </div>

                {/* Search & View Switcher (Day / Week / Month) */}
                <div className="flex items-center gap-2 ms-auto">
                  <div className="relative w-36 sm:w-48 hidden sm:block">
                    <Input
                      value={calQuery}
                      onChange={(e) => setCalQuery(e.target.value)}
                      placeholder="بحث في رحلاتي..."
                      className="!py-1 text-xs"
                    />
                  </div>

                  <div className="flex overflow-hidden rounded-xl border border-border">
                    {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => setCalView(v)}
                        className={`px-3 py-1 text-xs font-semibold transition ${
                          calView === v
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface text-muted hover:bg-surface2 hover:text-fg'
                        }`}
                      >
                        {v === 'day' ? 'يوم' : v === 'week' ? 'أسبوع' : 'شهر'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Calendar Main Grid Container */}
            <div className="h-[calc(100vh-14rem)] min-h-[500px] rounded-2xl border border-border bg-surface overflow-hidden shadow-card">
              {calView === 'month' ? (
                <MonthView
                  month={calAnchor}
                  events={visibleCalTrips}
                  colorFor={colorFor}
                  onDayClick={(d) => {
                    setCalAnchor(d);
                    setCalView('day');
                  }}
                  onEventClick={setCalDetailTrip}
                  onSlotClick={() => {}}
                />
              ) : (
                <TimeGridView
                  days={calDays}
                  events={visibleCalTrips}
                  colorFor={colorFor}
                  onCreate={() => {}}
                  onEventClick={setCalDetailTrip}
                  onEventMove={() => {}}
                  onDayHeaderClick={(d) => {
                    setCalAnchor(d);
                    setCalView('day');
                  }}
                />
              )}
            </div>

            {/* Helper Hint */}
            <p className="text-[11px] text-muted text-center">
              💡 اضغط على أي رحلة في التقويم لعرض تفاصيلها والضغط على <strong>«انطلاق للملاحة 🧭»</strong> للبدء فوراً.
            </p>
          </div>
        )}

        {/* ══════════════════ 2. GOOGLE MAPS NAVIGATION (MOBILE-OPTIMIZED) ══════════════════ */}
        {activeTab === 'navigation' && (
          <div className="space-y-2.5 md:space-y-0 md:grid md:grid-cols-12 md:gap-4 items-start">
            {/* ─── Column 1: Controls & Route Details (Full width on Mobile, 5 cols on Desktop) ─── */}
            <div className="space-y-2.5 md:col-span-5">
              {/* Google Maps Route Inputs Card */}
              <Card className="p-2.5 sm:p-3 space-y-2">
                {/* Header & Travel Mode Toggle */}
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-black text-xs shadow-sm">
                      🧭
                    </span>
                    <span className="text-xs font-bold text-fg truncate">ملاحة خرائط Google</span>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 bg-surface2 p-0.5 rounded-lg border border-border/70 shrink-0">
                    <button
                      type="button"
                      onClick={() => setTravelMode('driving')}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                        travelMode === 'driving' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted hover:text-fg'
                      }`}
                    >
                      🚗 سيارة
                    </button>
                    <button
                      type="button"
                      onClick={() => setTravelMode('walking')}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                        travelMode === 'walking' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted hover:text-fg'
                      }`}
                    >
                      🚶 مشي
                    </button>
                  </div>
                </div>

                {/* Search boxes: suggestions as you type, "my location", swap */}
                <div className="relative space-y-1.5">
                  <PlaceInput
                    value={wp.fromText}
                    badge="A"
                    badgeClass="bg-emerald-600"
                    placeholder="حدد نقطة الانطلاق..."
                    unresolved={fromDirty || (!!wp.fromText && !from.coord)}
                    onChange={(t) => wp.setText('from', t)}
                    onPick={(pl) => wp.setPlace('from', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
                    onClear={() => wp.clear('from')}
                    onUseCurrentLocation={() => wp.useMyLocation('from')}
                  />
                  <div className="flex justify-end pe-3 -my-1 relative z-10">
                    <button
                      type="button"
                      onClick={wp.swap}
                      title="تبديل نقطة الانطلاق والوجهة"
                      className="grid h-6 w-6 place-items-center rounded-full bg-surface border border-border text-muted shadow-sm hover:text-fg hover:border-blue-500 transition active:scale-95 text-xs"
                    >
                      ⇅
                    </button>
                  </div>
                  <PlaceInput
                    value={wp.toText}
                    badge="B"
                    badgeClass="bg-red-600"
                    placeholder="حدد الوجهة..."
                    unresolved={toDirty || (!!wp.toText && !to.coord)}
                    onChange={(t) => wp.setText('to', t)}
                    onPick={(pl) => wp.setPlace('to', { label: pl.label, coord: { lat: pl.lat, lng: pl.lng } })}
                    onClear={() => wp.clear('to')}
                  />
                  {wp.geoMsg && <p className="ps-1 text-[11px] text-amber-600">{wp.geoMsg}</p>}
                </div>

                {/* Route options */}
                {calculatingRoute && <p className="text-[11px] text-muted text-center animate-pulse py-1">جارٍ حساب مسار الملاحة...</p>}
                {routeError && !calculatingRoute && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-red-500/10 px-2.5 py-2 text-xs text-red-600">
                    <span>{routeError}</span>
                    {retryable && (
                      <button type="button" onClick={retryRoute} className="shrink-0 rounded-lg bg-red-600 px-2 py-1 font-bold text-white">
                        إعادة المحاولة
                      </button>
                    )}
                  </div>
                )}
                {routes.length > 0 && !calculatingRoute && (
                  <div className="flex snap-x gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="خيارات المسار">
                    {routes.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={i === selRoute}
                        onClick={() => setSelRoute(i)}
                        className={`w-40 shrink-0 snap-start rounded-xl border px-2.5 py-2 text-start transition ${
                          i === selRoute ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-surface2 hover:border-blue-400'
                        }`}
                      >
                        <div className={`text-lg font-black leading-none ${i === selRoute ? 'text-blue-600' : 'text-fg'}`}>{formatDuration(r.duration)}</div>
                        <div className="mt-1 truncate text-[11px] text-muted">
                          {formatDistance(r.distance)}
                          {r.summary ? ` • عبر ${r.summary}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Start in-app navigation */}
                <button
                  type="button"
                  onClick={() => setNavOpen(true)}
                  disabled={!navRoute || calculatingRoute || fromDirty || toDirty}
                  data-testid="driver-start-nav"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm">🧭</span>
                  <span>{calculatingRoute ? 'جارٍ حساب المسار…' : fromDirty || toDirty ? 'اختر الأماكن من الاقتراحات' : 'بدء الملاحة'}</span>
                </button>
              </Card>

              {/* Linked Transfer Context (if coming from a Trip) */}
              {selectedTrip && (
                <div className="rounded-xl bg-surface border border-border p-2.5 space-y-2 text-xs shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-blue-500 font-bold">رحلة ترانسفير مرتبطة</span>
                      <p className="font-bold text-fg text-xs sm:text-sm">المريض: {selectedTrip.patientName}</p>
                      <p className="text-muted font-mono text-[11px]" dir="ltr">{selectedTrip.patientPhone}</p>
                    </div>
                    <StatusPill status={selectedTrip.status} label={t(tripStatusKeys[selectedTrip.status])} />
                  </div>

                  {/* Actions for Transfer */}
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    {NEXT_ACTION[selectedTrip.status] && (
                      <Button
                        size="sm"
                        variant={NEXT_ACTION[selectedTrip.status]?.variant}
                        className="w-full font-bold text-xs py-1.5"
                        onClick={() => advanceTrip(selectedTrip)}
                      >
                        {NEXT_ACTION[selectedTrip.status]?.label}
                      </Button>
                    )}
                    <Button size="sm" variant="success" className="w-full text-xs py-1.5" onClick={() => setWaTrip(selectedTrip)}>
                      💬 واتساب
                    </Button>
                  </div>
                </div>
              )}

              {/* Location Sharing Box (Compact) */}
              <Card className="p-2.5 flex items-center justify-between text-xs">
                <div className="min-w-0 me-2">
                  <p className="text-xs font-bold text-fg truncate">مشاركة الموقع المباشر مع العيادة</p>
                  <p className="text-[10px] text-muted truncate">لتتبع السيارة في الوقت الفعلي</p>
                  {locMsg && <p className="text-[10px] text-emerald-600 font-medium">{locMsg}</p>}
                </div>
                <Button
                  size="sm"
                  variant={sharing ? 'danger' : 'secondary'}
                  className="text-xs shrink-0 py-1 px-2.5"
                  onClick={() => {
                    setSharing((s) => !s);
                    setLocMsg('');
                  }}
                >
                  {sharing ? 'إيقاف' : 'مشاركة'}
                </Button>
              </Card>
            </div>

            {/* ─── Column 2: Map Canvas (Full width on Mobile, 7 cols on Desktop) ─── */}
            <div className="md:col-span-7">
              <Card className="overflow-hidden p-1.5 shadow-card">
                <div className="h-[280px] sm:h-[350px] md:h-[520px] w-full">
                  <MapView
                    points={points}
                    route={navRoute ? navRoute.geometry.coordinates : null}
                    height="100%"
                    center={from.coord ?? mapConfig.defaultCenter}
                    zoom={13}
                  />
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════════════════ 3. MAINTENANCE & DEFECTS VIEW ══════════════════ */}
        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            {/* Vehicle Card */}
            <Card className="p-4 space-y-3 border-s-4 border-s-amber-500">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted">السيارة المسندة إليك:</span>
                  <h3 className="text-base font-black text-fg">
                    {driver?.vehicle ? `${driver.vehicle.make} ${driver.vehicle.model}` : 'لا توجد سيارة مسندة'}
                  </h3>
                </div>
                {driver?.vehicle && (
                  <span className="rounded-xl bg-surface2 px-3 py-1 text-sm font-bold font-mono text-fg border border-border">
                    {driver.vehicle.plate}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <span className="text-xs text-muted">حالة السيارة الحالية:</span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                  {driver?.vehicle?.status === 'MAINTENANCE' ? 'قيد الصيانة 🔧' : 'نشطة وجاهزة للخدمة ✓'}
                </span>
              </div>
            </Card>

            {/* Report New Defect / Maintenance Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-fg">سجلات الصيانة والأعطال</h3>
                <p className="text-xs text-muted">متابعة الصيانات السابقة أو الإبلاغ عن عطل جديد</p>
              </div>
              <Button
                onClick={() => {
                  setReportModalOpen(true);
                  setReportError('');
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
              >
                + تسجيل عطل / صيانة
              </Button>
            </div>

            {/* Maintenance History List */}
            {maintenanceLoading ? (
              <Card className="p-6 text-center text-xs text-muted">جارٍ تحميل سجلات الصيانة...</Card>
            ) : maintenanceRecords.length === 0 ? (
              <Card className="p-8 text-center">
                <EmptyState text="لا توجد سجلات صيانة أو أعطال مسجلة لهذه السيارة" />
              </Card>
            ) : (
              <div className="space-y-3">
                {maintenanceRecords.map((m) => (
                  <Card key={m.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-fg text-sm">{m.title}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          m.status === 'DONE'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : m.status === 'IN_PROGRESS'
                            ? 'bg-blue-500/10 text-blue-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {m.status === 'DONE' ? 'مكتملة ✓' : m.status === 'IN_PROGRESS' ? 'قيد الصيانة' : 'مجدولة'}
                      </span>
                    </div>

                    {m.description && <p className="text-xs text-muted leading-relaxed">{m.description}</p>}

                    <div className="flex items-center justify-between text-[11px] text-muted border-t border-border/60 pt-2">
                      <span>النوع: {m.type === 'REPAIR' ? 'عطل وإصلاح' : m.type === 'ROUTINE' ? 'صيانة دورية' : 'فحص'}</span>
                      {m.odometer && <span>عداد الكيلومتر: {m.odometer} كم</span>}
                      <span>{new Date(m.createdAt).toLocaleDateString('ar-SA')}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Bottom Navigation Bar (Mobile Friendly) ─── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-surface/95 backdrop-blur-md py-2 shadow-2xl md:hidden">
        {[
          { id: 'calendar', label: 'التقويم', icon: '📅' },
          { id: 'navigation', label: 'الملاحة', icon: '🧭' },
          { id: 'maintenance', label: 'الصيانة', icon: '🔧' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as DriverTab)}
            className={`flex flex-col items-center gap-1 px-4 py-1 text-xs font-bold transition ${
              activeTab === tab.id ? 'text-brand-600 scale-105' : 'text-muted hover:text-fg'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ─── Calendar Trip Detail Modal ─── */}
      <TripDetailModal
        trip={calDetailTrip}
        onClose={() => setCalDetailTrip(null)}
        onStatus={async (tr, st) => {
          await api.trips.setStatus(tr.id, st);
          setCalDetailTrip(null);
          loadDriver();
        }}
        onWhatsApp={(tr) => setWaTrip(tr)}
        onNavigate={(tr) => startNavForTrip(tr)}
      />

      {/* ─── Report Maintenance / Defect Modal ─── */}
      <Modal open={reportModalOpen} title="تسجيل عطل أو طلب صيانة" onClose={() => setReportModalOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{reportError}</ErrorText>

          <Field label="نوع البلاغ">
            <Select
              value={reportForm.type}
              onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}
            >
              <option value="REPAIR">عطل أو إصلاح طارئ (مكيف، فرامل، إطارات...)</option>
              <option value="ROUTINE">صيانة دورية (تغيير زيت، فلاتر)</option>
              <option value="INSPECTION">فحص ومعاينة فنية</option>
            </Select>
          </Field>

          <Field label="عنوان العطل / الصيانة" hint="مثال: صوت في الفرامل، تغيير زيت وفلتر">
            <Input
              value={reportForm.title}
              onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
              placeholder="اكتب عنوان العطل..."
            />
          </Field>

          <Field label="قراءة العداد الحالية (كم) - اختياري">
            <Input
              type="number"
              value={reportForm.odometer}
              onChange={(e) => setReportForm({ ...reportForm, odometer: e.target.value })}
              dir="ltr"
              placeholder="مثال: 45000"
            />
          </Field>

          <Field label="تفاصيل وملاحظات إضافية">
            <Textarea
              rows={3}
              value={reportForm.description}
              onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              placeholder="اشرح المشكلة للمسؤول بالتفصيل..."
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setReportModalOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={submitMaintenance} disabled={!reportForm.title.trim()}>
              إرسال البلاغ
            </Button>
          </div>
        </div>
      </Modal>

      {/* WhatsApp Modal */}
      <WhatsAppModal trip={waTrip} onClose={() => setWaTrip(null)} />
    </div>
  );
}
