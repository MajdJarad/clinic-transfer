import { useI18n } from '../../i18n';
import { weekdayShortKeys } from '../../labels';
import { isSameDay, startOfMonth, startOfWeek, addDays, formatMonthYear } from '../../lib/date';

interface MiniMonthProps {
  month: Date;
  selected: Date;
  onSelect: (d: Date) => void;
  onChangeMonth: (delta: number) => void;
}

export function MiniMonth({ month, selected, onSelect, onChangeMonth }: MiniMonthProps) {
  const { t, intl } = useI18n();
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const today = new Date();
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-fg">{formatMonthYear(month, intl)}</span>
        <div className="flex gap-1">
          <button
            onClick={() => onChangeMonth(-1)}
            className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg"
            aria-label={t('common.prev')}
          >
            ›
          </button>
          <button
            onClick={() => onChangeMonth(1)}
            className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-fg"
            aria-label={t('common.next')}
          >
            ‹
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdayShortKeys.map((key) => (
          <div key={key} className="py-1 text-[10px] font-medium text-muted">
            {t(key)}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isSelected = isSameDay(d, selected);
          const isToday = isSameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelect(d)}
              className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-xs transition ${
                isSelected
                  ? 'bg-brand-600 font-bold text-white'
                  : isToday
                    ? 'bg-brand-100 font-bold text-brand-700 dark:bg-brand-500/25 dark:text-brand-200'
                    : inMonth
                      ? 'text-fg hover:bg-surface2'
                      : 'text-muted/60 hover:bg-surface2'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
