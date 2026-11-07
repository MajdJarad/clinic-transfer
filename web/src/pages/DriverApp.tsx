import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useLocationSharing } from '../features/tracking/useLocationSharing';
import { DriverAlertButton } from '../features/alerts/DriverAlertButton';
import { MapScreen } from './MapPage';
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
  Textarea,
} from '../components/ui';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';
import { TripDetailModal } from '../components/trips/TripDetailModal';
import { driverStatusKeys } from '../labels';
import {
  addDays,
  addMonths,
  formatMonthYear,
  formatRangeLabel,
  isSameDay,
  startOfDay,
  startOfWeek,
} from '../lib/date';
import type { Driver, Maintenance, Trip, TripStatus } from '../types';

type DriverTab = 'calendar' | 'navigation' | 'maintenance';
type ViewMode = 'day' | 'week' | 'month';

const ACTIVE_STATUSES: TripStatus[] = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP'];

export function DriverApp() {
  const { user, logout } = useAuth();
  const { t, intl } = useI18n();
  const driverId = user?.driverId ?? '';

  // Active Tab
  const [activeTab, setActiveTab] = useState<DriverTab>('calendar');

  // Driver & Trips State
  const [driver, setDriver] = useState<Driver | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const selectedRef = useRef<Trip | null>(null);
  selectedRef.current = selectedTrip;

  // ─── Google Calendar State (Exact as Admin/Coordinator) ───
  const [calView, setCalView] = useState<ViewMode>('day');
  const [calAnchor, setCalAnchor] = useState<Date>(() => new Date());
  const [calDetailTrip, setCalDetailTrip] = useState<Trip | null>(null);
  const [calQuery, setCalQuery] = useState('');

  // The map tab fills the whole screen between the header and the bottom bar.
  const headerRef = useRef<HTMLElement>(null);
  const navBarRef = useRef<HTMLElement>(null);
  const [chrome, setChrome] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setChrome((headerRef.current?.offsetHeight ?? 0) + (navBarRef.current?.offsetHeight ?? 0));
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (navBarRef.current) ro.observe(navBarRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

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

  // Load Driver Data
  const loadDriver = useCallback(() => {
    if (!driverId) return;
    api.drivers.me(driverId).then(setDriver).catch(() => {});
    api.trips.mine().then((data) => {
      setTrips(data);
      // Keep the trip the driver is working on (refreshed with its new status); only pick one
      // automatically the first time. (This callback is memoized, so it must read the current
      // selection from a ref - the old code saw a stale "nothing selected" and jumped to another trip.)
      const prev = selectedRef.current;
      if (prev) {
        const fresh = data.find((tr) => tr.id === prev.id);
        if (fresh) setSelectedTrip(fresh);
      } else if (data.length > 0) {
        const current = data.find((tr) => ACTIVE_STATUSES.includes(tr.status)) ?? data[0];
        setSelectedTrip(current);
      }
    }).catch(() => {});
  }, [driverId]);

  // The phone shares its position with the clinic by itself while this app is open: always on, no switch.
  // When the server moves a trip along because of that position, the screen refreshes at once.
  const share = useLocationSharing(driverId, loadDriver);

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

  // A trip's status follows the car (arrived / picked up / completed are decided on the server from the
  // live position), so the screen keeps asking for the current state.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && loadDriver(), 5000);
    return () => clearInterval(id);
  }, [loadDriver]);

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
        t.origin.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q)
      );
    });
  }, [trips, calQuery]);

  // The trips of the day on screen, as a strip above the grid, so they are seen at once (the grid is 24 h tall).
  const dayTrips = useMemo(
    () => visibleCalTrips.filter((tr) => isSameDay(new Date(tr.scheduledAt), calAnchor)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
    [visibleCalTrips, calAnchor],
  );
  // No trip on this day: point to the nearest one that is still ahead (or the latest one).
  const nearestTrip = useMemo(() => {
    const from = startOfDay(calAnchor).getTime();
    const sorted = [...visibleCalTrips].sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
    return sorted.find((tr) => +new Date(tr.scheduledAt) >= from) ?? sorted[sorted.length - 1] ?? null;
  }, [visibleCalTrips, calAnchor]);

  // The map screen follows the selected trip by itself (start = my real position, target = patient, then
  // destination); opening a trip from the calendar just selects it and shows the map.
  const startNavForTrip = (tr: Trip) => {
    setSelectedTrip(tr);
    setActiveTab('navigation');
  };

  // "Go": the driver sets off towards the patient. This is the only status the driver sets; after it the
  // trip follows the car's position by itself.
  const startTrip = async (tr: Trip) => {
    const updated = await api.trips.start(tr.id);
    setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedRef.current?.id === updated.id) setSelectedTrip(updated);
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

  return (
    <div className={activeTab === 'navigation' ? 'h-[100dvh] overflow-hidden bg-bg' : 'min-h-screen bg-bg pb-20 md:pb-10'}>
      {/* ─── Driver Top Header ─── */}
      <header ref={headerRef} className="sticky top-0 z-30 bg-brand-900 px-4 py-3 text-white shadow-md">
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
            {/* The phone shares its position by itself, always: nothing to press. Only a problem is shown. */}
            {share.state === 'live' ? (
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" title="موقعك يصل للمنسق مباشرة" data-testid="share-dot" />
            ) : (
              <span className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[11px] font-bold text-amber-200" data-testid="share-problem">
                {share.state === 'denied' ? '⚠️ فعّل إذن الموقع' : share.state === 'unavailable' ? '⚠️ الموقع غير متاح' : '📡 …'}
              </span>
            )}
            <DriverAlertButton />
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
      <main className={activeTab === 'navigation' ? 'p-0' : 'p-3 md:p-4 max-w-6xl mx-auto'}>
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

            {calView === 'day' && dayTrips.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="driver-day-trips">
                {dayTrips.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => setCalDetailTrip(tr)}
                    className="shrink-0 rounded-xl border border-border bg-surface px-3 py-2 text-start shadow-card transition hover:border-blue-400"
                    data-testid={`day-trip-${tr.id}`}
                  >
                    <span className="block text-xs font-black text-fg">
                      🕓 {new Date(tr.scheduledAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })} • {tr.patientName}
                    </span>
                    <span className="block max-w-[15rem] truncate text-[11px] text-muted">
                      {tr.origin} ← {tr.destination}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {calView === 'day' && dayTrips.length === 0 && nearestTrip && (
              <button
                type="button"
                onClick={() => setCalAnchor(new Date(nearestTrip.scheduledAt))}
                className="w-full rounded-xl border border-dashed border-border bg-surface px-3 py-2 text-start text-xs font-semibold text-muted transition hover:border-blue-400"
                data-testid="driver-nearest-trip"
              >
                لا توجد رحلات في هذا اليوم — اضغط للانتقال إلى أقرب رحلة ({new Date(nearestTrip.scheduledAt).toLocaleDateString(intl, { day: 'numeric', month: 'long' })}، {new Date(nearestTrip.scheduledAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })})
              </button>
            )}

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
                  readOnly
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
          <div style={{ height: `calc(100dvh - ${chrome}px)` }} data-testid="driver-map-area">
            {/* The same map screen as the admin's, filling the screen. It follows the selected trip:
                start = my real position, target = the patient, then the destination. */}
            <MapScreen
              // One screen per trip: it must stay put when the trip's status changes (e.g. the arrival card
              // that confirms "trip finished" would vanish if the map were rebuilt at that moment).
              key={selectedTrip?.id ?? 'free'}
              className="h-full rounded-none"
              trip={selectedTrip}
              onStartTrip={startTrip}
            />
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
      <nav ref={navBarRef} className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-surface/95 backdrop-blur-md py-2 shadow-2xl md:hidden">
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
      {/* The driver only looks at the calendar: no edit, no status, no create/move/delete. The two actions
          are "Go" (navigate) and telling the patient the car is here. */}
      <TripDetailModal
        trip={calDetailTrip}
        onClose={() => setCalDetailTrip(null)}
        onNavigate={(tr) => startNavForTrip(tr)}
        onNotifyPatient={async (tr) => {
          const r = await api.trips.notifyPatient(tr.id);
          return r.status === 'requested' ? '✓ أُبلغ المنسق ليرسل الرسالة للمريض' : '✓ أُرسلت الرسالة للمريض';
        }}
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

    </div>
  );
}
