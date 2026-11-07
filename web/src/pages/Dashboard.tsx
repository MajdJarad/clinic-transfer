import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useMapConfig } from '../config';
import { MapView, type MapPoint } from '../features/map/MapView';
import { Button, Card, EmptyState, PageHeader, SectionTitle, StatusPill } from '../components/ui';
import { tripStatusKeys, tripTypeKeys } from '../labels';
import { isCurrent } from '../features/tracking/freshness';
import type { DashboardSummary, TrackingDriver, Trip } from '../types';
import { WhatsAppModal } from '../components/WhatsAppModal';

function StatCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Card>
  );
}

export function Dashboard() {
  const { t, intl } = useI18n();
  const mapConfig = useMapConfig();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<TrackingDriver[]>([]);
  const [waTrip, setWaTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setLoading(true);
    Promise.all([api.dashboard(), api.trips.list({ date: today }), api.drivers.live()])
      .then(([s, tr, d]) => {
        setSummary(s);
        setTrips(tr);
        setDrivers(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const points = useMemo<MapPoint[]>(
    () =>
      drivers
        .filter(isCurrent)
        .map((d) => ({
          id: d.id,
          lat: d.lat as number,
          lng: d.lng as number,
          title: d.name,
          subtitle: d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} - ${d.vehicle.plate}` : undefined,
        })),
    [drivers],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.availableDrivers')}
          value={summary?.drivers.available ?? 0}
          sub={t('dashboard.ofTotal', { total: summary?.drivers.total ?? 0 })}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label={t('dashboard.todayTrips')}
          value={summary?.trips.today ?? 0}
          sub={t('dashboard.activeTrips', { count: summary?.trips.active ?? 0 })}
          tone="text-brand-600 dark:text-brand-400"
        />
        <StatCard
          label={t('dashboard.vehiclesInService')}
          value={(summary?.vehicles.total ?? 0) - (summary?.vehicles.inMaintenance ?? 0)}
          sub={t('dashboard.inMaintenance', { count: summary?.vehicles.inMaintenance ?? 0 })}
          tone="text-fg"
        />
        <StatCard
          label={t('dashboard.openMaintenance')}
          value={summary?.maintenance.open ?? 0}
          sub={t('dashboard.scheduledInProgress')}
          tone="text-amber-600 dark:text-amber-400"
        />
      </div>

      <Card className="p-4">
        <SectionTitle>{t('dashboard.liveTracking')}</SectionTitle>
        <MapView
          points={points}
          height={340}
          center={mapConfig.defaultCenter}
          zoom={mapConfig.defaultZoom}
        />
        {points.length === 0 && <p className="mt-2 text-center text-xs text-muted">{t('dashboard.noLocations')}</p>}
      </Card>

      <Card className="p-4">
        <SectionTitle>{t('dashboard.todayTripsList')}</SectionTitle>
        {loading ? (
          <EmptyState text={t('common.loading')} />
        ) : trips.length === 0 ? (
          <EmptyState text={t('dashboard.noTripsToday')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">{t('dashboard.time')}</th>
                  <th className="py-2 text-start font-medium">{t('dashboard.patient')}</th>
                  <th className="py-2 text-start font-medium">{t('dashboard.route')}</th>
                  <th className="py-2 text-start font-medium">{t('dashboard.driver')}</th>
                  <th className="py-2 text-start font-medium">{t('dashboard.status')}</th>
                  <th className="py-2 text-start font-medium">{t('dashboard.action')}</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((tr) => (
                  <tr key={tr.id} className="border-b border-border/60">
                    <td className="py-2 font-medium text-fg">
                      {new Date(tr.scheduledAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 text-fg">{tr.patientName}</td>
                    <td className="py-2 text-muted">{t(tripTypeKeys[tr.type])}</td>
                    <td className="py-2 text-muted">{tr.driver?.user.name ?? '—'}</td>
                    <td className="py-2">
                      <StatusPill status={tr.status} label={t(tripStatusKeys[tr.status])} />
                    </td>
                    <td className="py-2">
                      {tr.driver && tr.vehicle ? (
                        <Button size="sm" variant="secondary" onClick={() => setWaTrip(tr)}>
                          {t('dashboard.notifyWa')}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted">{t('calendar.unassigned')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <WhatsAppModal trip={waTrip} onClose={() => setWaTrip(null)} />
    </div>
  );
}
