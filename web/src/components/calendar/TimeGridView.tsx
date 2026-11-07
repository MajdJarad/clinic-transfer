import { useEffect, useRef, useState } from 'react';
import type { Trip } from '../../types';
import { useI18n } from '../../i18n';
import { weekdayShortKeys } from '../../labels';
import {
  dateAtMinutes,
  formatTime,
  isSameDay,
  minutesSinceMidnight,
} from '../../lib/date';

const HOURS = 24;
const SNAP = 15;

interface Placed {
  id: string;
  col: number;
  cols: number;
}

function layoutOverlaps(items: { id: string; start: number; end: number }[]): Record<string, Placed> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Record<string, Placed> = {};
  let group: { id: string; start: number; end: number; col?: number }[] = [];
  let groupEnd = -1;

  const flush = () => {
    const colEnds: number[] = [];
    for (const it of group) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= it.start) {
          colEnds[c] = it.end;
          it.col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = colEnds.length;
        colEnds.push(it.end);
      }
    }
    const n = colEnds.length;
    for (const it of group) out[it.id] = { id: it.id, col: it.col ?? 0, cols: n };
    group = [];
    groupEnd = -1;
  };

  for (const it of sorted) {
    if (group.length && it.start >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}

interface TimeGridViewProps {
  days: Date[];
  events: Trip[];
  colorFor: (trip: Trip) => string;
  hourHeight?: number;
  onCreate: (date: Date, minutes: number) => void;
  onEventClick: (trip: Trip) => void;
  onEventMove: (trip: Trip, newStart: Date, newEnd: Date) => void;
  onDayHeaderClick?: (day: Date) => void;
  /** Look only: trips open on tap, but cannot be dragged and empty slots do not create anything. */
  readOnly?: boolean;
}

export function TimeGridView({
  days,
  events,
  colorFor,
  hourHeight = 44,
  onCreate,
  onEventClick,
  onEventMove,
  onDayHeaderClick,
  readOnly = false,
}: TimeGridViewProps) {
  const { t, intl } = useI18n();
  const bodyHeight = HOURS * hourHeight;
  const colsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef<{ key: string; hadEvents: boolean } | null>(null);
  const [now, setNow] = useState(new Date());
  const [drag, setDrag] = useState<{
    trip: Trip;
    startX: number;
    startY: number;
    dMinutes: number;
    dDays: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!drag) return;
    const colWidth = (colsRef.current?.clientWidth ?? 0) / days.length;
    const move = (e: PointerEvent) => {
      const dMinutes = Math.round((((e.clientY - drag.startY) / hourHeight) * 60) / SNAP) * SNAP;
      const dDays = colWidth ? Math.round((e.clientX - drag.startX) / colWidth) : 0;
      setDrag((d) =>
        d ? { ...d, dMinutes, dDays, moved: d.moved || Math.abs(e.clientY - d.startY) > 4 || Math.abs(e.clientX - d.startX) > 8 } : d,
      );
    };
    const up = () => {
      setDrag((d) => {
        if (d && d.moved && (d.dMinutes !== 0 || d.dDays !== 0)) {
          const base = new Date(d.trip.scheduledAt);
          const baseEnd = d.trip.endAt ? new Date(d.trip.endAt) : new Date(base.getTime() + 3600000);
          const delta = d.dDays * 1440 + d.dMinutes;
          onEventMove(
            d.trip,
            new Date(base.getTime() + delta * 60000),
            new Date(baseEnd.getTime() + delta * 60000),
          );
        } else if (d && !d.moved) {
          onEventClick(d.trip);
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, hourHeight, days.length, onEventMove, onEventClick]);

  // The grid starts at 00:00, but trips are in the daytime: open it one hour before the first trip of the
  // visible days (or around the current time, or 07:00), so trips are never hidden below the fold.
  // It happens once per set of days (again if the trips only arrive afterwards), never on every refresh.
  const dayKey = days.map((d) => d.toDateString()).join('|');
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const starts = events
      .filter((e) => days.some((d) => isSameDay(new Date(e.scheduledAt), d)))
      .map((e) => minutesSinceMidnight(new Date(e.scheduledAt)));
    const has = starts.length > 0;
    const done = scrolled.current;
    if (done && done.key === dayKey && (done.hadEvents || !has)) return;
    const now = new Date();
    const minutes = has ? Math.min(...starts) - 60 : days.some((d) => isSameDay(d, now)) ? now.getHours() * 60 - 60 : 7 * 60;
    el.scrollTop = Math.max(0, (minutes / 60) * hourHeight);
    scrolled.current = { key: dayKey, hadEvents: has };
  }, [dayKey, events, days, hourHeight]);

  const eventsByDay = days.map((day) =>
    events
      .filter((t) => isSameDay(new Date(t.scheduledAt), day))
      .map((t) => {
        const start = minutesSinceMidnight(new Date(t.scheduledAt));
        const endDate = t.endAt ? new Date(t.endAt) : new Date(new Date(t.scheduledAt).getTime() + 3600000);
        const end = t.endAt && isSameDay(endDate, day) ? minutesSinceMidnight(endDate) : start + 60;
        return { trip: t, start, end: Math.max(end, start + 20) };
      })
      .sort((a, b) => a.start - b.start),
  );

  const startDrag = (e: React.PointerEvent, trip: Trip) => {
    e.stopPropagation();
    e.preventDefault();
    if (readOnly) {
      onEventClick(trip);
      return;
    }
    setDrag({ trip, startX: e.clientX, startY: e.clientY, dMinutes: 0, dDays: 0, moved: false });
  };

  const slotClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.min(HOURS * 60 - SNAP, Math.max(0, Math.floor((y / hourHeight) * 60 / SNAP) * SNAP));
    onCreate(day, minutes);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex shrink-0 border-b border-border">
        <div className="w-14 shrink-0" />
        {days.map((day) => {
          const isToday = isSameDay(day, now);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDayHeaderClick?.(day)}
              className="flex flex-1 flex-col items-center border-s border-border py-1.5 transition hover:bg-surface2"
            >
              <span className="text-[11px] text-muted">{t(weekdayShortKeys[day.getDay()])}</span>
              <span
                className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm ${
                  isToday ? 'bg-brand-600 font-bold text-white' : 'font-medium text-fg'
                }`}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
        <div className="flex" style={{ height: bodyHeight }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: HOURS }, (_, h) => (
              <div
                key={h}
                className="absolute inset-x-0 pe-1 -translate-y-1/2 text-end text-[10px] text-muted"
                style={{ top: h * hourHeight }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          <div ref={colsRef} className="relative flex flex-1">
            {days.map((day, dayIndex) => {
              const dayEvents = eventsByDay[dayIndex];
              const placed = layoutOverlaps(dayEvents.map((e) => ({ id: e.trip.id, start: e.start, end: e.end })));
              return (
                <div
                  key={day.toISOString()}
                  className="relative flex-1 border-s border-border"
                  onMouseDown={(e) => {
                    if (e.button === 0) slotClick(day, e);
                  }}
                >
                  {Array.from({ length: HOURS }, (_, h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-b border-border/70"
                      style={{ top: h * hourHeight, height: hourHeight }}
                    />
                  ))}

                  {isSameDay(day, now) && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: (minutesSinceMidnight(now) / 60) * hourHeight }}
                    >
                      <div className="relative border-t-2 border-red-500">
                        <span className="absolute -end-1 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                      </div>
                    </div>
                  )}

                  {dayEvents.map(({ trip, start, end }) => {
                    const p = placed[trip.id];
                    const isDragging = drag?.trip.id === trip.id;
                    const widthPct = 100 / (p?.cols ?? 1);
                    const leftPct = (p?.col ?? 0) * widthPct;
                    const color = colorFor(trip);
                    const top = (start / 60) * hourHeight;
                    const height = Math.max(((end - start) / 60) * hourHeight, 18);
                    const translate =
                      isDragging && drag
                        ? `translate(${drag.dDays * 100}%, ${(drag.dMinutes / 60) * hourHeight}px)`
                        : undefined;
                    return (
                      <div
                        key={trip.id}
                        onPointerDown={(e) => startDrag(e, trip)}
                        className={`absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-sm ${isDragging ? 'z-30 opacity-90' : 'z-10'}`}
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: color,
                          transform: translate,
                        }}
                        title={`${trip.patientName} - ${formatTime(new Date(trip.scheduledAt), intl)}`}
                      >
                        <div className="truncate font-medium">{trip.patientName}</div>
                        <div className="truncate text-[10px] text-white/80">
                          {formatTime(new Date(trip.scheduledAt), intl)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-exported helper used by the calendar page.
export { dateAtMinutes };
