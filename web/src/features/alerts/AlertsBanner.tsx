import { Link } from 'react-router-dom';
import { ageLabel } from '../tracking/freshness';
import { useAlerts } from './AlertsProvider';
import { alertTypeIcon, alertTypeLabel } from './labels';

/** A red banner over every page while a driver's alert is unresolved. */
export function AlertsBanner() {
  const { alerts, ack, resolve } = useAlerts();
  if (!alerts.length) return null;
  const shown = alerts.slice(0, 3);
  return (
    <div className="fixed inset-x-0 top-0 z-[90] space-y-1 p-2" data-testid="alerts-banner" role="alert">
      {shown.map((a) => {
        const open = a.status === 'OPEN';
        return (
          <div
            key={a.id}
            data-testid={`alert-${a.id}`}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 px-3 py-2.5 text-white shadow-2xl ${
              open ? 'animate-pulse border-red-200 bg-red-600' : 'border-amber-200 bg-amber-600'
            }`}
          >
            <span className="text-2xl">{alertTypeIcon(a.type)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">
                {open ? '🚨 إنذار عاجل' : '⏳ قيد المتابعة'} — {alertTypeLabel(a.type)} • {a.driver.name}
                {a.driver.vehicle ? ` • ${a.driver.vehicle.plate}` : ''}
              </p>
              <p className="truncate text-xs font-semibold text-white/90">
                {a.note ? `${a.note} • ` : ''}
                {a.trip ? `رحلة: ${a.trip.patientName} • ` : ''}
                {ageLabel((Date.now() - new Date(a.createdAt).getTime()) / 1000)}
                {!open && a.acknowledgedBy ? ` • استلمه ${a.acknowledgedBy}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link to={`/tracking?driver=${a.driver.id}`} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30" data-testid="alert-locate">
                📍 على الخريطة
              </Link>
              {a.driver.phone && (
                <a href={`tel:${a.driver.phone}`} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30">
                  📞 اتصال
                </a>
              )}
              {open && (
                <button onClick={() => void ack(a.id)} className="rounded-lg bg-white px-3 py-1.5 text-xs font-black text-red-700" data-testid="alert-ack">
                  استلمت
                </button>
              )}
              <button onClick={() => void resolve(a.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold" data-testid="alert-resolve">
                ✓ تم الحل
              </button>
            </div>
          </div>
        );
      })}
      {alerts.length > shown.length && (
        <Link to="/alerts" className="block rounded-lg bg-red-800 px-3 py-1.5 text-center text-xs font-bold text-white">
          + {alerts.length - shown.length} إنذارات أخرى
        </Link>
      )}
    </div>
  );
}
