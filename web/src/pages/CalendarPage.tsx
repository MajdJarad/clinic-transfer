import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { driverStatusKeys } from '../labels';
import { Button, ErrorText, Field, Input, Modal, Select } from '../components/ui';
import { MiniMonth } from '../components/calendar/MiniMonth';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';
import { TripFormModal } from '../components/trips/TripFormModal';
import { TripDetailModal } from '../components/trips/TripDetailModal';
import { WhatsAppModal } from '../components/WhatsAppModal';
import { buildColorMap, UNASSIGNED_COLOR } from '../lib/colors';
import {
  addDays,
  addMonths,
  dateAtMinutes,
  formatMonthYear,
  formatRangeLabel,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../lib/date';
import type { Driver, Trip, TripStatus } from '../types';

type ViewMode = 'day' | 'week' | 'month';

export function CalendarPage() {
  const { t, intl } = useI18n();
  const [view, setView] = useState<ViewMode>('day');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [defaultStart, setDefaultStart] = useState<Date | null>(null);
  const [detailTrip, setDetailTrip] = useState<Trip | null>(null);
  const [assignTrip, setAssignTrip] = useState<Trip | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [waTrip, setWaTrip] = useState<Trip | null>(null);
  const [error, setError] = useState('');

  const days = useMemo(() => {
    if (view === 'day') return [startOfDay(anchor)];
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    return [];
  }, [view, anchor]);

  const range = useMemo(() => {
    if (view === 'month') {
      const s = startOfWeek(startOfMonth(anchor));
      return { from: s, to: addDays(s, 42) };
    }
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return { from: s, to: addDays(s, 7) };
    }
    const s = startOfDay(anchor);
    return { from: s, to: addDays(s, 1) };
  }, [view, anchor]);

  const loadTrips = useCallback(() => {
    api.trips
      .list({ from: range.from.toISOString(), to: range.to.toISOString() })
      .then(setTrips)
      .catch(() => {});
  }, [range]);

  useEffect(loadTrips, [loadTrips]);
  useEffect(() => {
    api.drivers.list().then(setDrivers).catch(() => {});
  }, []);

  const colorMap = useMemo(() => buildColorMap(drivers.map((d) => d.id)), [drivers]);
  const colorFor = useCallback(
    (trip: Trip) => (trip.driverId ? colorMap[trip.driverId] ?? UNASSIGNED_COLOR : UNASSIGNED_COLOR),
    [colorMap],
  );

  const visibleTrips = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trips.filter((t) => {
      if (t.driverId ? hidden.includes(t.driverId) : !showUnassigned) return false;
      if (!q) return true;
      return (
        t.patientName.toLowerCase().includes(q) ||
        t.patientPhone.toLowerCase().includes(q) ||
        t.origin.toLowerCase().includes(q) ||
        t.destination.toLowerCase().includes(q) ||
        (t.driver?.user.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [trips, hidden, showUnassigned, query]);

  const title = useMemo(() => {
    if (view === 'month') return formatMonthYear(anchor, intl);
    if (view === 'week') return formatRangeLabel(days[0], addDays(days[6], 0), intl);
    return days[0].toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [view, anchor, days, intl]);

  const navigate = (dir: number) => {
    if (view === 'month') setAnchor((a) => addMonths(a, dir));
    else if (view === 'week') setAnchor((a) => addDays(a, dir * 7));
    else setAnchor((a) => addDays(a, dir));
  };

  const openCreate = (date: Date, minutes = 9 * 60) => {
    setEditingTrip(null);
    setDefaultStart(dateAtMinutes(date, minutes));
    setFormOpen(true);
  };

  const moveTrip = (trip: Trip, newStart: Date, newEnd: Date) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === trip.id ? { ...t, scheduledAt: newStart.toISOString(), endAt: newEnd.toISOString() } : t,
      ),
    );
    api.trips
      .update(trip.id, { scheduledAt: newStart.toISOString(), endAt: newEnd.toISOString() })
      .catch(() => loadTrips());
  };

  const changeStatus = async (trip: Trip, status: TripStatus) => {
    await api.trips.setStatus(trip.id, status);
    setDetailTrip(null);
    loadTrips();
  };

  const deleteTrip = async (trip: Trip) => {
    await api.trips.delete(trip.id);
    setDetailTrip(null);
    loadTrips();
  };

  const cancelTrip = async (trip: Trip) => {
    await api.trips.cancel(trip.id);
    setDetailTrip(null);
    loadTrips();
  };

  const doAssign = async () => {
    if (!assignTrip) return;
    setError('');
    try {
      await api.trips.assign(assignTrip.id, assignDriverId || null);
      setAssignTrip(null);
      loadTrips();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const toggleDriver = (id: string) => {
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[560px] flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
          {t('common.today')}
        </Button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg"
            aria-label={t('common.prev')}
          >
            ›
          </button>
          <button
            onClick={() => navigate(1)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg"
            aria-label={t('common.next')}
          >
            ‹
          </button>
        </div>
        <h1 className="text-lg font-bold text-fg">{title}</h1>

        <div className="relative ms-auto w-full max-w-xs sm:w-64">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('calendar.searchPlaceholder')}
            className="!ps-9"
          />
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-3.5-3.5" />
          </svg>
        </div>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm transition ${
                view === v ? 'bg-brand-600 text-white' : 'bg-surface text-muted hover:bg-surface2'
              }`}
            >
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => openCreate(view === 'month' ? anchor : days[0])}>
          {t('calendar.newTrip')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col gap-4 lg:flex">
          <Button onClick={() => openCreate(view === 'month' ? anchor : startOfDay(anchor))} className="w-full">
            {t('calendar.newTrip')}
          </Button>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <MiniMonth
              month={anchor}
              selected={anchor}
              onSelect={(d) => setAnchor(d)}
              onChangeMonth={(delta) => setAnchor((a) => addMonths(a, delta))}
            />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs font-bold text-muted">{t('calendar.calendars')}</p>
            <div className="space-y-1.5">
              {drivers.map((d) => {
                const on = !hidden.includes(d.id);
                return (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleDriver(d.id)}
                      className="h-3.5 w-3.5 accent-brand-600"
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorMap[d.id] }} />
                    <span className={`truncate ${on ? 'text-fg' : 'text-muted'}`}>{d.user.name}</span>
                    <span className="ms-auto text-[10px] text-muted">{t(driverStatusKeys[d.status])}</span>
                  </label>
                );
              })}
              <label className="flex cursor-pointer items-center gap-2 border-t border-border pt-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={showUnassigned}
                  onChange={() => setShowUnassigned((s) => !s)}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: UNASSIGNED_COLOR }} />
                <span className="text-fg">{t('calendar.unassigned')}</span>
              </label>
            </div>
          </div>
          {query && <p className="text-xs text-muted">{t('calendar.noResults')}: {visibleTrips.length}</p>}
          <ErrorText>{error}</ErrorText>
        </aside>

        {/* Main */}
        <div className="min-h-0 flex-1">
          <div className="h-full min-h-[520px]">
            {query && visibleTrips.length === 0 ? (
              <div className="grid h-full place-items-center rounded-2xl border border-border bg-surface text-sm text-muted">
                {t('calendar.noResults')}
              </div>
            ) : view === 'month' ? (
              <MonthView
                month={anchor}
                events={visibleTrips}
                colorFor={colorFor}
                onDayClick={(d) => {
                  setAnchor(d);
                  setView('day');
                }}
                onEventClick={setDetailTrip}
                onSlotClick={(d) => openCreate(d)}
              />
            ) : (
              <TimeGridView
                days={days}
                events={visibleTrips}
                colorFor={colorFor}
                onCreate={openCreate}
                onEventClick={setDetailTrip}
                onEventMove={moveTrip}
                onDayHeaderClick={(d) => {
                  setAnchor(d);
                  setView('day');
                }}
              />
            )}
          </div>
        </div>
      </div>

      <TripFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadTrips}
        drivers={drivers}
        trip={editingTrip}
        defaultStart={defaultStart}
      />

      <TripDetailModal
        trip={detailTrip}
        onClose={() => setDetailTrip(null)}
        onEdit={(tr) => {
          setDetailTrip(null);
          setEditingTrip(tr);
          setFormOpen(true);
        }}
        onAssign={(tr) => {
          setDetailTrip(null);
          setAssignTrip(tr);
          setAssignDriverId(tr.driver?.id ?? '');
        }}
        onWhatsApp={(tr) => {
          setDetailTrip(null);
          setWaTrip(tr);
        }}
        onStatus={changeStatus}
        onCancel={cancelTrip}
        onDelete={deleteTrip}
      />

      <Modal open={!!assignTrip} title={t('assign.title')} onClose={() => setAssignTrip(null)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <p className="text-sm text-muted">{t('assign.patient', { name: assignTrip?.patientName ?? '' })}</p>
          <Field label={t('assign.driver')} hint={t('assign.hint')}>
            <Select value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
              <option value="">{t('assign.none')}</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name}
                  {d.vehicle ? ` (${d.vehicle.plate})` : ` ${t('assign.noVehicle')}`}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignTrip(null)}>
              {t('assign.close')}
            </Button>
            <Button onClick={doAssign}>{t('assign.save')}</Button>
          </div>
        </div>
      </Modal>

      <WhatsAppModal trip={waTrip} onClose={() => setWaTrip(null)} />
    </div>
  );
}
