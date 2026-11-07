import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Driver, Trip, TripType } from '../../types';
import { toInputValue } from '../../lib/date';
import { useI18n } from '../../i18n';
import { tripTypeKeys } from '../../labels';
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from '../ui';
import { PlaceInput } from '../../features/map/PlaceInput';
import { isValidInternationalPhone, PHONE_HELP } from '../../lib/phone';

const TRIP_TYPES: TripType[] = ['AIRPORT_TO_HOTEL', 'HOTEL_TO_AIRPORT', 'HOTEL_TO_CLINIC', 'CLINIC_TO_HOTEL'];

interface TripFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  drivers: Driver[];
  trip?: Trip | null;
  defaultStart?: Date | null;
}

export function TripFormModal({ open, onClose, onSaved, drivers, trip, defaultStart }: TripFormModalProps) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    type: 'AIRPORT_TO_HOTEL' as TripType,
    origin: '',
    destination: '',
    originLat: null as number | null,
    originLng: null as number | null,
    destLat: null as number | null,
    destLng: null as number | null,
    start: '',
    end: '',
    driverId: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (trip) {
      const start = new Date(trip.scheduledAt);
      const end = trip.endAt ? new Date(trip.endAt) : new Date(start.getTime() + 3600000);
      setForm({
        patientName: trip.patientName,
        patientPhone: trip.patientPhone,
        type: trip.type,
        origin: trip.origin,
        destination: trip.destination,
        originLat: trip.originLat,
        originLng: trip.originLng,
        destLat: trip.destLat,
        destLng: trip.destLng,
        start: toInputValue(start),
        end: toInputValue(end),
        driverId: trip.driver?.id ?? '',
        notes: trip.notes ?? '',
      });
    } else {
      const start = defaultStart ?? new Date();
      const end = new Date(start.getTime() + 3600000);
      setForm({
        patientName: '',
        patientPhone: '',
        type: 'AIRPORT_TO_HOTEL',
        origin: '',
        destination: '',
        originLat: null,
        originLng: null,
        destLat: null,
        destLng: null,
        start: toInputValue(start),
        end: toInputValue(end),
        driverId: '',
        notes: '',
      });
    }
  }, [open, trip, defaultStart]);

  const phoneOk = isValidInternationalPhone(form.patientPhone);

  const save = async () => {
    if (!phoneOk) {
      setError(PHONE_HELP);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        patientName: form.patientName,
        patientPhone: form.patientPhone,
        type: form.type,
        origin: form.origin,
        destination: form.destination,
        originLat: form.originLat,
        originLng: form.originLng,
        destLat: form.destLat,
        destLng: form.destLng,
        scheduledAt: new Date(form.start).toISOString(),
        endAt: form.end ? new Date(form.end).toISOString() : null,
        driverId: form.driverId || null,
        notes: form.notes || undefined,
      };
      if (trip) await api.trips.update(trip.id, payload);
      else await api.trips.create(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={trip ? t('tripForm.editTrip') : t('tripForm.newTrip')} onClose={onClose} wide>
      <div className="space-y-4">
        <ErrorText>{error}</ErrorText>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('tripForm.patientName')}>
            <Input
              value={form.patientName}
              onChange={(e) => setForm({ ...form, patientName: e.target.value })}
              placeholder={t('tripForm.patientName')}
            />
          </Field>
          <Field label={t('tripForm.patientPhone')} hint={form.patientPhone && !phoneOk ? PHONE_HELP : undefined}>
            <Input
              value={form.patientPhone}
              onChange={(e) => setForm({ ...form, patientPhone: e.target.value })}
              dir="ltr"
              placeholder="+905331234567"
            />
          </Field>
          <Field label={t('tripForm.type')}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TripType })}>
              {TRIP_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {t(tripTypeKeys[tt])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('tripForm.driver')}>
            <Select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">{t('tripForm.unassigned')}</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name}
                  {d.vehicle ? ` (${d.vehicle.plate})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          {/* Plain wrappers (not <Field>): a <label> around a suggestion list would hijack its clicks. */}
          <div>
            <span className="mb-1 block text-sm font-medium text-muted">{t('tripForm.origin')}</span>
            <PlaceInput
              value={form.origin}
              badge="A"
              badgeClass="bg-emerald-600"
              placeholder={t('tripForm.phOrigin')}
              unresolved={!!form.origin && form.originLat == null}
              onChange={(text) => setForm({ ...form, origin: text, originLat: null, originLng: null })}
              onPick={(pl) => setForm({ ...form, origin: pl.label, originLat: pl.lat, originLng: pl.lng })}
              onClear={() => setForm({ ...form, origin: '', originLat: null, originLng: null })}
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-muted">{t('tripForm.destination')}</span>
            <PlaceInput
              value={form.destination}
              badge="B"
              badgeClass="bg-red-600"
              placeholder={t('tripForm.phDestination')}
              unresolved={!!form.destination && form.destLat == null}
              onChange={(text) => setForm({ ...form, destination: text, destLat: null, destLng: null })}
              onPick={(pl) => setForm({ ...form, destination: pl.label, destLat: pl.lat, destLng: pl.lng })}
              onClear={() => setForm({ ...form, destination: '', destLat: null, destLng: null })}
            />
          </div>
          <Field label={t('tripForm.start')}>
            <Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label={t('tripForm.end')}>
            <Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
        </div>
        <Field label={t('tripForm.notes')}>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={save}
            loading={busy}
            disabled={!form.patientName || !phoneOk || !form.origin || !form.destination || !form.start}
          >
            {trip ? t('tripForm.saveChanges') : t('tripForm.create')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
