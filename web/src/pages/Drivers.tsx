import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { driverStatusKeys } from '../labels';
import { Card, EmptyState, PageHeader, Select, StatusPill } from '../components/ui';
import type { Driver, DriverStatus } from '../types';

const STATUSES: DriverStatus[] = ['AVAILABLE', 'ON_TRIP', 'OFFLINE'];

export function Drivers() {
  const { t } = useI18n();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.drivers.list().then(setDrivers).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const changeStatus = async (id: string, status: DriverStatus) => {
    await api.drivers.setStatus(id, status);
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('drivers.title')} subtitle={t('drivers.subtitle')} />

      <Card className="p-4">
        {loading ? (
          <EmptyState text={t('common.loading')} />
        ) : drivers.length === 0 ? (
          <EmptyState text={t('drivers.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">{t('drivers.driver')}</th>
                  <th className="py-2 text-start font-medium">{t('drivers.phone')}</th>
                  <th className="py-2 text-start font-medium">{t('drivers.license')}</th>
                  <th className="py-2 text-start font-medium">{t('drivers.vehicle')}</th>
                  <th className="py-2 text-start font-medium">{t('drivers.status')}</th>
                  <th className="py-2 text-start font-medium">{t('drivers.changeStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} className="border-b border-border/60">
                    <td className="py-3 font-medium text-fg">{d.user.name}</td>
                    <td className="py-3 text-muted" dir="ltr">
                      {d.user.phone ?? '—'}
                    </td>
                    <td className="py-3 text-muted">{d.licenseNo ?? '—'}</td>
                    <td className="py-3 text-muted">
                      {d.vehicle ? `${d.vehicle.make} ${d.vehicle.model} - ${d.vehicle.plate}` : t('drivers.notAssigned')}
                    </td>
                    <td className="py-3">
                      <StatusPill status={d.status} label={t(driverStatusKeys[d.status])} />
                    </td>
                    <td className="py-3">
                      <Select
                        className="w-32 !py-1 text-xs"
                        value={d.status}
                        onChange={(e) => changeStatus(d.id, e.target.value as DriverStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(driverStatusKeys[s])}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
