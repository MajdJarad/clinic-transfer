import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { useAlerts } from '../features/alerts/AlertsProvider';
import { ALERT_STATUS_LABEL, alertTypeIcon, alertTypeLabel } from '../features/alerts/labels';
import type { AlertItem } from '../types';

const STATUS_COLOR: Record<AlertItem['status'], string> = {
  OPEN: 'bg-red-500/10 text-red-600 border-red-500/30',
  ACKNOWLEDGED: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  RESOLVED: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
};

/** The log of driver alerts, newest first. */
export function Alerts() {
  const { alerts: live, ack, resolve } = useAlerts();
  const [all, setAll] = useState<AlertItem[] | null>(null);

  // Refresh the history whenever the live list changes (an alert arrived or was handled).
  useEffect(() => {
    api.alerts.list(true).then(setAll).catch(() => setAll([]));
  }, [live]);

  return (
    <div className="space-y-4">
      <PageHeader title="الإنذارات" subtitle="الإنذارات العاجلة التي يرسلها السائقون، والمتابعة حتى الحل" />
      {all === null ? (
        <EmptyState text="جارٍ التحميل…" />
      ) : all.length === 0 ? (
        <EmptyState text="لا توجد إنذارات" />
      ) : (
        <div className="space-y-3" data-testid="alerts-list">
          {all.map((a) => (
            <Card key={a.id} className="p-4" data-testid={`alert-row-${a.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-fg">
                    {alertTypeIcon(a.type)} {alertTypeLabel(a.type)} — {a.driver.name}
                    {a.driver.vehicle ? ` • ${a.driver.vehicle.plate}` : ''}
                  </p>
                  {a.note && <p className="mt-1 text-sm text-fg">{a.note}</p>}
                  {a.trip && (
                    <p className="mt-1 text-xs text-muted">
                      رحلة: {a.trip.patientName} — {a.trip.origin} ← {a.trip.destination}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(a.createdAt).toLocaleString('en-GB')}
                    {a.acknowledgedBy ? ` • استلمه ${a.acknowledgedBy}` : ''}
                    {a.resolvedBy ? ` • حلّه ${a.resolvedBy}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[a.status]}`}>{ALERT_STATUS_LABEL[a.status]}</span>
                  <Link to={`/tracking?driver=${a.driver.id}`} className="rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs font-bold text-fg">
                    📍 الخريطة
                  </Link>
                  {a.driver.phone && (
                    <a href={`tel:${a.driver.phone}`} className="rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs font-bold text-fg">
                      📞
                    </a>
                  )}
                  {a.status === 'OPEN' && (
                    <button onClick={() => void ack(a.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-black text-white">
                      استلمت
                    </button>
                  )}
                  {a.status !== 'RESOLVED' && (
                    <button onClick={() => void resolve(a.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">
                      ✓ تم الحل
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
