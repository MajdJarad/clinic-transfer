import { useRef } from 'react';
import { Icon } from '../../components/Icon';
import { Link } from 'react-router-dom';
import { useChromeHeight } from '../../lib/chromeExtra';
import { ageLabel } from '../tracking/freshness';
import { useAlerts } from './AlertsProvider';
import { alertTypeLabel } from './labels';

const WarnIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3 2 21h20L12 3z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);

const ghost =
  'rounded-lg border border-current/25 px-2.5 py-1 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10';

/**
 * Unresolved driver alerts, kept above the page content (never on top of it) while any is open.
 * Calm but unmistakable: a tinted card with a coloured edge, no flashing. The siren (sound) is what
 * calls attention; the card says what happened and offers the next step.
 */
export function AlertsBanner() {
  const { alerts, ack, resolve } = useAlerts();
  const box = useRef<HTMLDivElement>(null);
  useChromeHeight('alerts', box, alerts.length > 0);
  if (!alerts.length) return null;
  const shown = alerts.slice(0, 2);
  return (
    <div ref={box} className="sticky top-14 z-20 space-y-2 px-4 pt-3 md:px-6" data-testid="alerts-banner" role="alert">
      {shown.map((a) => {
        const open = a.status === 'OPEN';
        return (
          <div
            key={a.id}
            data-testid={`alert-${a.id}`}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-s-4 px-4 py-3 shadow-sm ${
              open
                ? 'border-red-200 border-s-red-500 bg-red-50 text-red-900 dark:border-red-500/30 dark:border-s-red-500 dark:bg-red-500/10 dark:text-red-100'
                : 'border-amber-200 border-s-amber-500 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:border-s-amber-500 dark:bg-amber-500/10 dark:text-amber-100'
            }`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${open ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'}`}>
              <WarnIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {open ? 'إنذار عاجل' : 'قيد المتابعة'} — {alertTypeLabel(a.type)} • {a.driver.name}
                {a.driver.vehicle ? ` • ${a.driver.vehicle.plate}` : ''}
              </p>
              <p className="truncate text-xs opacity-80">
                {a.note ? `${a.note} • ` : ''}
                {a.trip ? `رحلة: ${a.trip.patientName} • ` : ''}
                {ageLabel((Date.now() - new Date(a.createdAt).getTime()) / 1000)}
                {!open && a.acknowledgedBy ? ` • استلمه ${a.acknowledgedBy}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link to={`/tracking?driver=${a.driver.id}`} className={ghost} data-testid="alert-locate">
                <Icon name="pin" inline /> على الخريطة
              </Link>
              {a.driver.phone && (
                <a href={`tel:${a.driver.phone}`} className={ghost}>
                  <Icon name="phone" inline /> اتصال
                </a>
              )}
              {open && (
                <button onClick={() => void ack(a.id)} className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-700" data-testid="alert-ack">
                  استلمت
                </button>
              )}
              <button onClick={() => void resolve(a.id)} className={`${ghost} font-semibold`} data-testid="alert-resolve">
                <Icon name="check" inline /> تم الحل
              </button>
            </div>
          </div>
        );
      })}
      {alerts.length > shown.length && (
        <Link to="/alerts" className="block rounded-lg bg-red-100 px-3 py-1.5 text-center text-xs font-medium text-red-800 dark:bg-red-500/15 dark:text-red-200">
          + {alerts.length - shown.length} إنذارات أخرى
        </Link>
      )}
    </div>
  );
}
