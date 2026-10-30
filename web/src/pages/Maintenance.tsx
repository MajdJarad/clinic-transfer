import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { maintenanceStatusKeys, maintenanceTypeKeys } from '../labels';
import { formatDateTime } from '../lib/date';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusPill,
  Textarea,
} from '../components/ui';
import type { Maintenance, MaintenanceStatus, MaintenanceType, Vehicle } from '../types';

const TYPES: MaintenanceType[] = ['ROUTINE', 'REPAIR', 'INSPECTION'];
const STATUSES: MaintenanceStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'DONE'];
const emptyForm = { vehicleId: '', type: 'ROUTINE' as MaintenanceType, title: '', description: '', cost: '' };

export function MaintenancePage() {
  const { t, intl } = useI18n();
  const [records, setRecords] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.maintenance.list().then(setRecords).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.vehicles.list().then(setVehicles);
  }, []);

  const save = async () => {
    setError('');
    try {
      await api.maintenance.create({
        vehicleId: form.vehicleId,
        type: form.type,
        title: form.title,
        description: form.description || undefined,
        cost: form.cost ? Number(form.cost) : undefined,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const complete = async (id: string) => {
    await api.maintenance.complete(id);
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await api.maintenance.update(id, { status });
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('maintenance.title')}
        subtitle={t('maintenance.subtitle')}
        action={<Button onClick={() => setOpen(true)}>{t('maintenance.new')}</Button>}
      />

      <Card className="p-4">
        {loading ? (
          <EmptyState text={t('common.loading')} />
        ) : records.length === 0 ? (
          <EmptyState text={t('maintenance.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">{t('maintenance.vehicle')}</th>
                  <th className="py-2 text-start font-medium">{t('maintenance.item')}</th>
                  <th className="py-2 text-start font-medium">{t('maintenance.type')}</th>
                  <th className="py-2 text-start font-medium">{t('maintenance.cost')}</th>
                  <th className="py-2 text-start font-medium">{t('maintenance.status')}</th>
                  <th className="py-2 text-start font-medium">{t('maintenance.date')}</th>
                  <th className="py-2 text-start font-medium">{t('maintenance.action')}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-3 font-medium text-fg">
                      {r.vehicle.make} {r.vehicle.model}
                      <span className="text-xs text-muted" dir="ltr">
                        {' '}
                        {r.vehicle.plate}
                      </span>
                    </td>
                    <td className="py-3 text-fg">
                      {r.title}
                      {r.description ? <div className="text-xs text-muted">{r.description}</div> : null}
                    </td>
                    <td className="py-3 text-muted">{t(maintenanceTypeKeys[r.type])}</td>
                    <td className="py-3 text-muted">{r.cost != null ? r.cost : '—'}</td>
                    <td className="py-3">
                      <StatusPill status={r.status} label={t(maintenanceStatusKeys[r.status])} />
                    </td>
                    <td className="py-3 text-muted">{formatDateTime(r.createdAt ?? new Date().toISOString(), intl)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        <Select
                          className="w-32 !py-1 text-xs"
                          value={r.status}
                          onChange={(e) => setStatus(r.id, e.target.value)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(maintenanceStatusKeys[s])}
                            </option>
                          ))}
                        </Select>
                        {r.status !== 'DONE' && (
                          <Button size="sm" variant="success" onClick={() => complete(r.id)}>
                            {t('maintenance.complete')}
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

      <Modal open={open} title={t('maintenance.createTitle')} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label={t('maintenance.vehicle')}>
            <Select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
              <option value="">{t('maintenance.chooseVehicle')}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} - {v.plate}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('maintenance.type')}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MaintenanceType })}>
              {TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {t(maintenanceTypeKeys[tt])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('maintenance.item')}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('maintenance.phTitle')} />
          </Field>
          <Field label={t('maintenance.details')}>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t('maintenance.costOptional')}>
            <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={!form.vehicleId || !form.title}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
