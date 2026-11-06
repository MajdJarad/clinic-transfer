import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useMapConfig } from '../config';
import { MapView, type MapPoint } from '../components/MapView';
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from '../lib/googleMaps';
import { NavigationScreen } from '../components/NavigationScreen';
import type { RouteData } from '../lib/routeNav';
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
  const [origin, setOrigin] = useState<string>(DEFAULT_ORIGIN.label);
  const [destination, setDestination] = useState<string>(DEFAULT_DESTINATION.label);
  const [origCoord, setOrigCoord] = useState<{ lat: number; lng: number } | null>(DEFAULT_ORIGIN.coord);
  const [destCoord, setDestCoord] = useState<{ lat: number; lng: number } | null>(DEFAULT_DESTINATION.coord);
  const [travelMode, setTravelMode] = useState<'driving' | 'walking'>('driving');
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [navRoute, setNavRoute] = useState<RouteData | null>(null); // full route with turn-by-turn steps
  const [navOpen, setNavOpen] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [searchingField, setSearchingField] = useState<'origin' | 'destination' | null>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);

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
        if (current) {
          setOrigin(current.origin);
          setDestination(current.destination);
          if (current.originLat && current.originLng) {
            setOrigCoord({ lat: current.originLat, lng: current.originLng });
          }
          if (current.destLat && current.destLng) {
            setDestCoord({ lat: current.destLat, lng: current.destLng });
          }
        }
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

  // ─── Start Navigation for Trip (Called from Calendar or List) ───
  const startNavForTrip = (tr: Trip) => {
    setSelectedTrip(tr);
    setOrigin(tr.origin);
    setDestination(tr.destination);
    const oLat = tr.originLat ?? DEFAULT_ORIGIN.coord.lat;
    const oLng = tr.originLng ?? DEFAULT_ORIGIN.coord.lng;
    const dLat = tr.destLat ?? DEFAULT_DESTINATION.coord.lat;
    const dLng = tr.destLng ?? DEFAULT_DESTINATION.coord.lng;
    setOrigCoord({ lat: oLat, lng: oLng });
    setDestCoord({ lat: dLat, lng: dLng });
    setActiveTab('navigation');
  };

  // ─── Swap Origin & Destination ───
  const swapWaypoints = () => {
    const tempName = origin;
    setOrigin(destination);
    setDestination(tempName);

    const tempCoord = origCoord;
    setOrigCoord(destCoord);
    setDestCoord(tempCoord);
  };

  // ─── Use Current GPS for Origin ───
  const useCurrentGps = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setOrigCoord({ lat: latitude, lng: longitude });
        setOrigin('موقعي الحالي (GPS)');
      },
      () => alert('يرجى تفعيل خدمة الموقع في جوالك'),
      { enableHighAccuracy: true }
    );
  };

  // ─── Address Autocomplete & Search ───
  const handleAddressSearch = async (val: string, field: 'origin' | 'destination') => {
    if (field === 'origin') setOrigin(val);
    else setDestination(val);

    if (val.length >= 3) {
      setSearchingField(field);
      try {
        const res = await api.geo.search(val, 5);
        setSuggestions(res);
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
      setSearchingField(null);
    }
  };

  const selectSuggestion = (s: { label: string; lat: number; lng: number }) => {
    if (searchingField === 'origin') {
      setOrigin(s.label);
      setOrigCoord({ lat: s.lat, lng: s.lng });
    } else if (searchingField === 'destination') {
      setDestination(s.label);
      setDestCoord({ lat: s.lat, lng: s.lng });
    }
    setSuggestions([]);
    setSearchingField(null);
  };

  // ─── Calculate Route Whenever Orig & Dest change ───
  useEffect(() => {
    if (!origCoord || !destCoord) {
      setRoute(null);
      setNavRoute(null);
      setRouteInfo(null);
      return;
    }

    let cancelled = false;
    setCalculatingRoute(true);

    api.geo
      .route(origCoord, destCoord, travelMode, false)
      .then((res) => {
        if (cancelled) return;
        if (res.geometry?.coordinates) {
          setNavRoute(res.routes?.[0] ?? res);
          setRoute(res.geometry.coordinates);
          setRouteInfo({ distance: res.distance, duration: res.duration });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoute(null);
          setNavRoute(null);
          // Fallback approximate calculation
          const R = 6371;
          const dLat = ((destCoord.lat - origCoord.lat) * Math.PI) / 180;
          const dLon = ((destCoord.lng - origCoord.lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((origCoord.lat * Math.PI) / 180) *
              Math.cos((destCoord.lat * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          setRouteInfo({
            distance: d * 1000,
            duration: Math.max(d * 1.6 * 60, 300),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCalculatingRoute(false);
      });

    return () => {
      cancelled = true;
    };
  }, [origCoord, destCoord, travelMode]);

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
    if (origCoord) {
      list.push({
        id: 'origin',
        lat: origCoord.lat,
        lng: origCoord.lng,
        title: origin || 'الانطلاق',
        color: '#137333',
      });
    }
    if (destCoord) {
      list.push({
        id: 'dest',
        lat: destCoord.lat,
        lng: destCoord.lng,
        title: destination || 'الوجهة',
        color: '#d93025',
      });
    }
    return list;
  }, [origCoord, destCoord, origin, destination]);

  // In-app turn-by-turn navigation (live GPS when the start point is "my location", otherwise a preview)
  const originIsGps = origin.startsWith('موقعي الحالي');

  return (
    <div className="min-h-screen bg-bg pb-20 md:pb-10">
      {navOpen && navRoute && origCoord && destCoord && (
        <NavigationScreen
          origin={{ label: origin, coord: origCoord }}
          destination={{ label: destination, coord: destCoord }}
          mode={travelMode}
          route={navRoute}
          startWithGps={originIsGps}
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

                {/* Unified Google Maps Search Box */}
                <div className="relative rounded-xl border border-border bg-surface2/60 p-2 focus-within:border-blue-500 transition">
                  <div className="flex items-center gap-2">
                    {/* Visual Route Indicator Dots & Dotted Line */}
                    <div className="flex flex-col items-center justify-between py-1 self-stretch shrink-0">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="نقطة الانطلاق (A)" />
                      <div className="w-0.5 flex-1 my-1 border-s-2 border-dotted border-muted/50" />
                      <span className="h-2.5 w-2.5 rounded-sm bg-red-500 ring-2 ring-red-500/20" title="الوجهة (B)" />
                    </div>

                    {/* Inputs */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Origin Input */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="text"
                          value={origin}
                          onChange={(e) => handleAddressSearch(e.target.value, 'origin')}
                          placeholder="حدد نقطة الانطلاق..."
                          className="w-full bg-transparent text-xs text-fg placeholder-muted focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={useCurrentGps}
                          title="استخدام موقعي الحالي"
                          className="text-[10px] text-blue-500 hover:underline shrink-0 font-medium whitespace-nowrap bg-blue-500/10 px-1.5 py-0.5 rounded"
                        >
                          📍 موقعي
                        </button>
                        {origin && (
                          <button
                            type="button"
                            onClick={() => {
                              setOrigin('');
                              setOrigCoord(null);
                            }}
                            className="text-xs text-muted hover:text-fg shrink-0 p-0.5"
                            title="إلغاء الموقع"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="border-t border-border/50" />

                      {/* Destination Input */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="text"
                          value={destination}
                          onChange={(e) => handleAddressSearch(e.target.value, 'destination')}
                          placeholder="حدد الوجهة أو أضف موقعاً جديداً..."
                          className="w-full bg-transparent text-xs text-fg placeholder-muted focus:outline-none"
                        />
                        {destination && (
                          <button
                            type="button"
                            onClick={() => {
                              setDestination('');
                              setDestCoord(null);
                            }}
                            className="text-xs text-muted hover:text-fg shrink-0 p-0.5"
                            title="إلغاء الموقع"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Swap Button on the Side */}
                    <button
                      type="button"
                      onClick={swapWaypoints}
                      title="تبديل نقطة الانطلاق والوجهة"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface border border-border text-muted shadow-sm hover:text-fg hover:border-blue-500 transition active:scale-95"
                    >
                      ⇅
                    </button>
                  </div>

                  {/* Autocomplete Suggestions Dropdown */}
                  {suggestions.length > 0 && searchingField && (
                    <div className="absolute top-full start-0 end-0 z-50 mt-1 max-h-44 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl text-xs">
                      {suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-fg hover:bg-surface2 transition"
                        >
                          <span className="shrink-0">📍</span>
                          <span className="truncate text-xs">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Route Summary (ETA & Distance) */}
                {calculatingRoute ? (
                  <p className="text-[11px] text-muted text-center animate-pulse py-1">
                    جارٍ حساب مسار الملاحة...
                  </p>
                ) : routeInfo ? (
                  <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-black text-blue-600">
                        {Math.round(routeInfo.duration / 60)} دقيقة
                      </span>
                      <span className="text-xs text-muted font-medium">
                        ({(routeInfo.distance / 1000).toFixed(1)} كم)
                      </span>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 font-bold text-[10px]">
                      أسرع مسار ✓
                    </span>
                  </div>
                ) : null}

                {/* Big Google Navigation Button */}
                <button
                  type="button"
                  onClick={() => setNavOpen(true)}
                  disabled={!navRoute || calculatingRoute}
                  data-testid="driver-start-nav"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm">🧭</span>
                  <span>{calculatingRoute ? 'جارٍ حساب المسار…' : 'بدء الملاحة'}</span>
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
                    route={route}
                    height="100%"
                    center={origCoord ?? mapConfig.defaultCenter}
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
