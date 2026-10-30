import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { vehicleStatusKeys } from '../labels';
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
} from '../components/ui';
import type { Driver, Vehicle, VehicleStatus } from '../types';

const emptyForm = {
  make: 'تويوتا',
  model: 'كورولا',
  plate: '',
  color: 'أبيض',
  capacity: 4,
  status: 'ACTIVE' as VehicleStatus,
  driverId: '',
};

export function Vehicles() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Edit Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  // Assign Modal State
  const [assignVehicle, setAssignVehicle] = useState<Vehicle | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');

  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.vehicles
      .list()
      .then(setVehicles)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.drivers.list().then(setDrivers);
  }, []);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.plate.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.color && v.color.toLowerCase().includes(q)) ||
        (v.driver?.user.name && v.driver.user.name.toLowerCase().includes(q))
      );
    });
  }, [vehicles, statusFilter, search]);

  // Create new vehicle
  const create = async () => {
    setError('');
    try {
      await api.vehicles.create({
        make: form.make,
        model: form.model,
        plate: form.plate,
        color: form.color,
        capacity: Number(form.capacity),
      });
      setCreateOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  // Open Edit Modal
  const openEdit = (v: Vehicle) => {
    setEditingVehicle(v);
    setEditForm({
      make: v.make,
      model: v.model,
      plate: v.plate,
      color: v.color ?? '',
      capacity: v.capacity,
      status: v.status as VehicleStatus,
      driverId: v.driver?.id ?? '',
    });
    setError('');
    setEditOpen(true);
  };

  // Save Edit Changes
  const saveEdit = async () => {
    if (!editingVehicle) return;
    setError('');
    try {
      // 1. Update vehicle details
      await api.vehicles.update(editingVehicle.id, {
        make: editForm.make,
        model: editForm.model,
        plate: editForm.plate,
        color: editForm.color,
        capacity: Number(editForm.capacity),
        status: editForm.status,
      });

      // 2. Update driver assignment if changed
      const currentDriverId = editingVehicle.driver?.id ?? '';
      if (editForm.driverId !== currentDriverId) {
        await api.vehicles.assign(editingVehicle.id, editForm.driverId || null);
      }

      setEditOpen(false);
      setEditingVehicle(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  // Delete vehicle (Admin only)
  const deleteVehicle = async (v: Vehicle) => {
    if (!window.confirm(`هل أنت متأكد من حذف السيارة ${v.make} ${v.model} (لوحة ${v.plate})؟`)) {
      return;
    }
    try {
      await api.vehicles.delete(v.id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'فشل حذف السيارة');
    }
  };

  // Quick Assign Driver
  const doAssign = async () => {
    if (!assignVehicle) return;
    setError('');
    try {
      await api.vehicles.assign(assignVehicle.id, assignDriverId || null);
      setAssignVehicle(null);
      setAssignDriverId('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('vehicles.title')}
        subtitle="إدارة أسطول السيارات وتعديل بياناتها وإسناد السائقين ومتابعة حالتها"
        action={
          <Button onClick={() => { setForm(emptyForm); setError(''); setCreateOpen(true); }}>
            + سيارة جديدة
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute inset-y-0 start-3 flex items-center text-muted">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم اللوحة، الموديل، اللون، أو اسم السائق..."
              className="w-full rounded-xl border border-border bg-surface2 ps-9 pe-3 py-2 text-xs text-fg placeholder-muted focus:outline-none focus:border-brand-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute inset-y-0 end-3 text-xs text-muted hover:text-fg"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Chips */}
          <div className="flex gap-1.5 text-xs">
            {[
              { id: 'ALL', label: 'الكل' },
              { id: 'ACTIVE', label: 'نشطة' },
              { id: 'MAINTENANCE', label: 'في الصيانة' },
              { id: 'OUT_OF_SERVICE', label: 'خارج الخدمة' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id)}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  statusFilter === chip.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface2 text-muted hover:text-fg'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Vehicles Table */}
      <Card className="p-4">
        {loading ? (
          <EmptyState text={t('common.loading')} />
        ) : filteredVehicles.length === 0 ? (
          <EmptyState text="لا توجد سيارات مطابقة لبحثك" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2.5 text-start font-medium">السيارة والموديل</th>
                  <th className="py-2.5 text-start font-medium">رقم اللوحة</th>
                  <th className="py-2.5 text-start font-medium">اللون</th>
                  <th className="py-2.5 text-start font-medium">السعة</th>
                  <th className="py-2.5 text-start font-medium">السائق المسند</th>
                  <th className="py-2.5 text-start font-medium">الحالة</th>
                  <th className="py-2.5 text-start font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((v) => (
                  <tr key={v.id} className="border-b border-border/60 hover:bg-surface2/30 transition">
                    <td className="py-3 font-semibold text-fg">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 font-bold text-xs">
                          🚗
                        </span>
                        <span>{v.make} {v.model}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="rounded-lg bg-surface2 px-2.5 py-1 text-xs font-bold font-mono text-fg border border-border" dir="ltr">
                        {v.plate}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-muted">
                      {v.color || '—'}
                    </td>
                    <td className="py-3 text-xs text-muted">
                      {v.capacity} ركاب
                    </td>
                    <td className="py-3 text-sm">
                      {v.driver ? (
                        <div className="flex items-center gap-1.5 font-medium text-fg">
                          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                          <span>{v.driver.user.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">غير مسندة</span>
                      )}
                    </td>
                    <td className="py-3">
                      <StatusPill status={v.status} label={t(vehicleStatusKeys[v.status])} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(v)}>
                          ✏️ تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAssignVehicle(v);
                            setAssignDriverId(v.driver?.id ?? '');
                          }}
                        >
                          👤 {v.driver ? 'عزل' : 'إسناد'}
                        </Button>
                        {user?.role === 'ADMIN' && (
                          <Button
                            size="sm"
                            variant="danger"
                            className="!px-2 text-xs"
                            onClick={() => deleteVehicle(v)}
                            title="حذف السيارة"
                          >
                            🗑️
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

      {/* ─── Create Vehicle Modal ─── */}
      <Modal open={createOpen} title="إضافة سيارة جديدة" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="نوع وماركة السيارة">
              <Input
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                placeholder="تويوتا"
              />
            </Field>
            <Field label="موديل السيارة">
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="كورولا"
              />
            </Field>
            <Field label="رقم اللوحة (مثال: نمرة اسطنبول)">
              <Input
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                dir="ltr"
                placeholder="34 MPV 786"
              />
            </Field>
            <Field label="لون السيارة">
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="أزرق (كحلي)"
              />
            </Field>
            <Field label="سعة الركاب">
              <Input
                type="number"
                min="1"
                max="50"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={create} disabled={!form.make || !form.model || !form.plate}>
              حفظ السيارة
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Edit Vehicle Modal (Full Editing) ─── */}
      <Modal open={editOpen} title={`تعديل بيانات السيارة: ${editingVehicle?.make} ${editingVehicle?.model}`} onClose={() => setEditOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="ماركة السيارة (Make)">
              <Input
                value={editForm.make}
                onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
              />
            </Field>
            <Field label="موديل السيارة (Model)">
              <Input
                value={editForm.model}
                onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
              />
            </Field>
            <Field label="رقم اللوحة (Car Plate)">
              <Input
                value={editForm.plate}
                onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label="لون السيارة (Car Color)">
              <Input
                value={editForm.color}
                onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
              />
            </Field>
            <Field label="سعة الركاب (Capacity)">
              <Input
                type="number"
                min="1"
                max="50"
                value={editForm.capacity}
                onChange={(e) => setEditForm({ ...editForm, capacity: Number(e.target.value) })}
              />
            </Field>
            <Field label="حالة السيارة (Status)">
              <Select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as VehicleStatus })}
              >
                <option value="ACTIVE">نشطة وفي الخدمة (ACTIVE)</option>
                <option value="MAINTENANCE">في الصيانة (MAINTENANCE)</option>
                <option value="OUT_OF_SERVICE">خارج الخدمة (OUT_OF_SERVICE)</option>
              </Select>
            </Field>
          </div>

          <Field label="السائق المسند للسيارة">
            <Select
              value={editForm.driverId}
              onChange={(e) => setEditForm({ ...editForm, driverId: e.target.value })}
            >
              <option value="">بدون سائق (عزل السيارة)</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} {d.vehicle && d.vehicle.id !== editingVehicle?.id ? `(لديه سيارة: ${d.vehicle.plate})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveEdit} disabled={!editForm.make || !editForm.model || !editForm.plate}>
              حفظ التعديلات
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Assign / Detach Modal ─── */}
      <Modal open={!!assignVehicle} title={`إسناد سائق للسيارة (${assignVehicle?.plate})`} onClose={() => setAssignVehicle(null)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <p className="text-sm text-muted">
            {assignVehicle?.make} {assignVehicle?.model} - لوحة: <strong dir="ltr">{assignVehicle?.plate}</strong>
          </p>
          <Field label="اختر السائق" hint="اختر «بدون سائق» لعزل السيارة">
            <Select value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
              <option value="">بدون سائق (عزل السيارة)</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} {d.vehicle && d.vehicle.id !== assignVehicle?.id ? `(لديه: ${d.vehicle.plate})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignVehicle(null)}>
              إغلاق
            </Button>
            <Button onClick={doAssign}>حفظ الإسناد</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
