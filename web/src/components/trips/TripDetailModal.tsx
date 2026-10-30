import { useNavigate } from 'react-router-dom';
import type { Trip, TripStatus } from '../../types';
import { useI18n } from '../../i18n';
import { tripStatusKeys, tripTypeKeys } from '../../labels';
import { formatTime } from '../../lib/date';
import { Button, Modal, Select, StatusPill } from '../ui';

const STATUSES: TripStatus[] = ['SCHEDULED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

interface TripDetailModalProps {
  trip: Trip | null;
  onClose: () => void;
  onEdit?: (trip: Trip) => void;
  onAssign?: (trip: Trip) => void;
  onWhatsApp?: (trip: Trip) => void;
  onStatus?: (trip: Trip, status: TripStatus) => void;
  onCancel?: (trip: Trip) => void;
  onNavigate?: (trip: Trip) => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="text-end text-sm font-medium text-fg">{value}</span>
    </div>
  );
}

export function TripDetailModal({ trip, onClose, onEdit, onAssign, onWhatsApp, onStatus, onCancel, onNavigate }: TripDetailModalProps) {
  const { t, intl } = useI18n();
  const navigate = useNavigate();

  const startNavigation = (tr: Trip) => {
    if (onNavigate) {
      onClose();
      onNavigate(tr);
      return;
    }
    const params = new URLSearchParams();
    params.set('origin', tr.origin);
    params.set('destination', tr.destination);
    if (tr.originLat) params.set('origLat', String(tr.originLat));
    if (tr.originLng) params.set('origLng', String(tr.originLng));
    if (tr.destLat) params.set('destLat', String(tr.destLat));
    if (tr.destLng) params.set('destLng', String(tr.destLng));
    params.set('patient', tr.patientName);
    if (tr.patientPhone) params.set('phone', tr.patientPhone);
    if (tr.driver?.user.name) params.set('driver', tr.driver.user.name);
    params.set('tripId', tr.id);

    onClose();
    navigate(`/map?${params.toString()}`);
  };

  return (
    <Modal open={!!trip} title={t('tripDetail.title')} onClose={onClose}>
      {trip && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-brand-600" />
              <span className="text-base font-bold text-fg">{trip.patientName}</span>
            </div>
            <StatusPill status={trip.status} label={t(tripStatusKeys[trip.status])} />
          </div>

          <div className="divide-y divide-border rounded-xl bg-surface2 px-3 py-1">
            <Row label={t('tripDetail.type')} value={t(tripTypeKeys[trip.type])} />
            <Row
              label={t('tripDetail.time')}
              value={`${formatTime(new Date(trip.scheduledAt), intl)} - ${
                trip.endAt
                  ? formatTime(new Date(trip.endAt), intl)
                  : formatTime(new Date(new Date(trip.scheduledAt).getTime() + 3600000), intl)
              }`}
            />
            <Row label={t('tripDetail.from')} value={trip.origin} />
            <Row label={t('tripDetail.to')} value={trip.destination} />
            <Row label={t('tripDetail.patientPhone')} value={<span dir="ltr">{trip.patientPhone}</span>} />
            <Row
              label={t('tripDetail.driver')}
              value={trip.driver ? trip.driver.user.name : <span className="text-amber-500">{t('calendar.unassigned')}</span>}
            />
            <Row
              label={t('tripDetail.vehicle')}
              value={trip.vehicle ? `${trip.vehicle.make} ${trip.vehicle.model} - ${trip.vehicle.plate}` : '—'}
            />
            {trip.notes ? <Row label={t('tripDetail.notes')} value={trip.notes} /> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="!bg-blue-600 hover:!bg-blue-700 !text-white font-bold flex items-center gap-1.5 shadow-sm"
              onClick={() => startNavigation(trip)}
            >
              <span>🧭</span>
              <span>انطلاق للملاحة</span>
            </Button>
            {onStatus && (
              <Select
                className="w-40 !py-1.5 text-sm"
                value={trip.status}
                onChange={(e) => onStatus(trip, e.target.value as TripStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(tripStatusKeys[s])}
                  </option>
                ))}
              </Select>
            )}
            {onEdit && (
              <Button size="sm" variant="secondary" onClick={() => onEdit(trip)}>
                {t('tripDetail.edit')}
              </Button>
            )}
            {onAssign && (
              <Button size="sm" variant="secondary" onClick={() => onAssign(trip)}>
                {t('tripDetail.assign')}
              </Button>
            )}
            {onWhatsApp && (
              <Button size="sm" variant="success" onClick={() => onWhatsApp(trip)}>
                {t('tripDetail.whatsapp')}
              </Button>
            )}
            {onCancel && trip.status !== 'CANCELLED' && trip.status !== 'COMPLETED' && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(trip)}>
                {t('tripDetail.cancel')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
