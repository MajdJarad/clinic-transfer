import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { tripStatusKeys, tripTypeKeys } from '../labels';
import { formatDateTime } from '../lib/date';
import { Button, Card, EmptyState, ErrorText, Field, Input, Modal, PageHeader, Select, StatusPill } from '../components/ui';
import { TripFormModal } from '../components/trips/TripFormModal';
import { TripDetailModal } from '../components/trips/TripDetailModal';
import { WhatsAppModal } from '../components/WhatsAppModal';
import type { Driver, Trip, TripStatus } from '../types';

const TRIP_STATUSES: TripStatus[] = [
  'SCHEDULED',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
];

export function Trips() {
  const { t, intl } = useI18n();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [detailTrip, setDetailTrip] = useState<Trip | null>(null);
  const [assignTrip, setAssignTrip] = useState<Trip | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [waTrip, setWaTrip] = useState<Trip | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (date) params.date = date;
    if (status) params.status = status;
    api.trips
      .list(params)
      .then(setTrips)
      .finally(() => setLoading(false));
  };

  useEffect(load, [date, status]);
  useEffect(() => {
    api.drivers.list().then(setDrivers);
  }, []);

  const defaultStart = useMemo(() => new Date(), [formOpen]);

  const doAssign = async () => {
    if (!assignTrip) return;
    setError('');
    try {
      await api.trips.assign(assignTrip.id, assignDriverId || null);
      setAssignTrip(null);
      setAssignDriverId('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const changeStatus = async (trip: Trip, newStatus: TripStatus) => {
    await api.trips.setStatus(trip.id, newStatus);
    setDetailTrip(null);
    load();
  };

  const cancel = async (trip: Trip) => {
    await api.trips.cancel(trip.id);
    setDetailTrip(null);
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('trips.title')}
        subtitle={t('trips.subtitle')}
        action={
          <Button
            onClick={() => {
              setEditingTrip(null);
              setFormOpen(true);
            }}
          >
            {t('calendar.newTrip')}
          </Button>
        }
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label={t('trips.date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('trips.status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('trips.all')}</option>
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(tripStatusKeys[s])}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            setDate('');
            setStatus('');
          }}
        >
          {t('common.reset')}
        </Button>
      </Card>

      <Card className="p-4">
        {loading ? (
          <EmptyState text={t('common.loading')} />
        ) : trips.length === 0 ? (
          <EmptyState text={t('trips.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">{t('trips.time')}</th>
                  <th className="py-2 text-start font-medium">{t('trips.patient')}</th>
                  <th className="py-2 text-start font-medium">{t('trips.route')}</th>
                  <th className="py-2 text-start font-medium">{t('trips.driverVehicle')}</th>
                  <th className="py-2 text-start font-medium">{t('trips.status')}</th>
                  <th className="py-2 text-start font-medium">{t('trips.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((tr) => (
                  <tr key={tr.id} className="border-b border-border/60 align-middle">
                    <td className="whitespace-nowrap py-3 text-fg">{formatDateTime(tr.scheduledAt, intl)}</td>
                    <td className="py-3">
                      <div className="font-medium text-fg">{tr.patientName}</div>
                      <div className="text-xs text-muted" dir="ltr">
                        {tr.patientPhone}
                      </div>
                    </td>
                    <td className="py-3 text-muted">
                      <div>{t(tripTypeKeys[tr.type])}</div>
                      <div className="text-xs text-muted">
                        {tr.origin} ← {tr.destination}
                      </div>
                    </td>
                    <td className="py-3 text-muted">
                      {tr.driver ? (
                        <>
                          <div>{tr.driver.user.name}</div>
                          <div className="text-xs text-muted">
                            {tr.vehicle ? `${tr.vehicle.make} ${tr.vehicle.model} - ${tr.vehicle.plate}` : '—'}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-amber-500">{t('calendar.unassigned')}</span>
                      )}
                    </td>
                    <td className="py-3">
                      <StatusPill status={tr.status} label={t(tripStatusKeys[tr.status])} />
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => setDetailTrip(tr)}>
                          {t('tripDetail.title')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setAssignTrip(tr);
                            setAssignDriverId(tr.driver?.id ?? '');
                          }}
                        >
                          {t('tripDetail.assign')}
                        </Button>
                        {tr.driver && tr.vehicle && (
                          <Button size="sm" variant="secondary" onClick={() => setWaTrip(tr)}>
                            {t('wa.title')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TripFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
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
        onCancel={cancel}
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

      <ErrorText>{error}</ErrorText>
      <WhatsAppModal trip={waTrip} onClose={() => setWaTrip(null)} />
    </div>
  );
}
