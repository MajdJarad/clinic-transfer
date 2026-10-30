import type { Trip } from '../../types';
import { useI18n } from '../../i18n';
import { weekdayShortKeys } from '../../labels';
import { addDays, formatTime, isSameDay, startOfMonth, startOfWeek } from '../../lib/date';

interface MonthViewProps {
  month: Date;
  events: Trip[];
  colorFor: (trip: Trip) => string;
  onDayClick: (day: Date) => void;
  onEventClick: (trip: Trip) => void;
  onSlotClick: (day: Date) => void;
}

export function MonthView({ month, events, colorFor, onDayClick, onEventClick, onSlotClick }: MonthViewProps) {
  const { t, intl } = useI18n();
  const gridStart = startOfWeek(startOfMonth(month));
  const today = new Date();
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {weekdayShortKeys.map((key) => (
          <div key={key} className="border-s border-border py-2 text-center text-xs font-medium text-muted">
            {t(key)}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = events
            .filter((t) => isSameDay(new Date(t.scheduledAt), day))
            .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
          const shown = dayEvents.slice(0, 3);
          return (
            <div
              key={day.toISOString()}
              className={`flex min-h-0 flex-col border-b border-s border-border p-1 ${inMonth ? 'bg-surface' : 'bg-surface2/60'}`}
              onDoubleClick={() => onSlotClick(day)}
            >
              <button
                onClick={() => onDayClick(day)}
                className={`mb-0.5 grid h-6 w-6 shrink-0 place-items-center self-start rounded-full text-xs ${
                  isToday ? 'bg-brand-600 font-bold text-white' : inMonth ? 'text-fg hover:bg-surface2' : 'text-muted/60'
                }`}
              >
                {day.getDate()}
              </button>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {shown.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onEventClick(t)}
                    className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-start text-[10px] font-medium text-white"
                    style={{ backgroundColor: colorFor(t) }}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                    <span className="truncate">{formatTime(new Date(t.scheduledAt), intl)} {t.patientName}</span>
                  </button>
                ))}
                {dayEvents.length > shown.length && (
                  <button onClick={() => onDayClick(day)} className="px-1 text-start text-[10px] text-muted hover:text-fg">
                    {t('calendar.more', { count: dayEvents.length - shown.length })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
