import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useMapConfig } from '../config';
import { MapView, type MapPoint } from '../components/MapView';
import { Card, EmptyState, PageHeader, SectionTitle, StatusPill } from '../components/ui';
import { driverStatusKeys } from '../labels';
import type { TrackingDriver } from '../types';

export function Tracking() {
  const { t } = useI18n();
  const mapConfig = useMapConfig();
  const [drivers, setDrivers] = useState<TrackingDriver[]>([]);

  useEffect(() => {
    let active = true;
    const tick = () => api.drivers.live().then((d) => active && setDrivers(d)).catch(() => {});
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const points = useMemo<MapPoint[]>(
    () =>
      drivers
        .filter((d) => d.lat != null && d.lng != null)
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
    <div className="space-y-5">
      <PageHeader title={t('tracking.title')} subtitle={t('tracking.subtitle')} />

      <Card className="p-4">
        <MapView
          points={points}
          height={420}
          center={mapConfig.defaultCenter}
          zoom={mapConfig.defaultZoom}
        />
      </Card>

      <Card className="p-4">
        <SectionTitle>{t('tracking.onMap')}</SectionTitle>
        {drivers.length === 0 ? (
          <EmptyState text={t('tracking.noLocations')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {drivers.map((d) => (
              <div key={d.id} className="rounded-xl border border-border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-fg">{d.name}</span>
                  <StatusPill status={d.status} label={t(driverStatusKeys[d.status])} />
                </div>
                <p className="text-xs text-muted">
                  {d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} - ${d.vehicle.plate}` : t('tracking.noVehicle')}
                </p>
                <p className="mt-1 text-xs text-muted" dir="ltr">
                  {d.lat?.toFixed(4)}, {d.lng?.toFixed(4)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {t('tracking.source')}: {d.source === 'traccar' ? t('tracking.sourceTraccar') : t('tracking.sourcePhone')}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
