import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Card, EmptyState, ErrorText, Field, Input, Modal, Textarea } from '../components/ui';
import type { Patient } from '../types';

const emptyForm = { name: '', phone: '', nationalId: '', notes: '' };

export function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.patients.list(q).then(setPatients).finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  };

  const openEdit = (p: Patient) => {
    setEditing(p);
    setForm({
      name: p.name,
      phone: p.phone,
      nationalId: p.nationalId ?? '',
      notes: p.notes ?? '',
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setError('');
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        nationalId: form.nationalId || undefined,
        notes: form.notes || undefined,
      };
      if (editing) await api.patients.update(editing.id, payload);
      else await api.patients.create(payload);
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">المرضى</h1>
          <p className="text-sm text-slate-400">بيانات المرضى وأرقام التواصل لتبليغهم</p>
        </div>
        <Button onClick={openCreate}>+ مريض جديد</Button>
      </div>

      <Card className="p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو الجوال أو الهوية..."
          className="mb-4 max-w-sm"
        />
        {loading ? (
          <EmptyState text="جارٍ التحميل..." />
        ) : patients.length === 0 ? (
          <EmptyState text="لا يوجد مرضى" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-slate-400">
                <tr className="border-b border-slate-100">
                  <th className="py-2 font-medium">الاسم</th>
                  <th className="py-2 font-medium">رقم الجوال</th>
                  <th className="py-2 font-medium">الهوية</th>
                  <th className="py-2 font-medium">ملاحظات</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="py-3 font-medium text-slate-700">{p.name}</td>
                    <td className="py-3 text-slate-500" dir="ltr">
                      {p.phone}
                    </td>
                    <td className="py-3 text-slate-500" dir="ltr">
                      {p.nationalId ?? '—'}
                    </td>
                    <td className="py-3 text-slate-400">{p.notes ?? '—'}</td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        تعديل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} title={editing ? 'تعديل مريض' : 'مريض جديد'} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label="الاسم">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="رقم الجوال" hint="يُستخدم لرابط واتساب (يمكن إدخاله بصيغة محلية)">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
          </Field>
          <Field label="رقم الهوية">
            <Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} dir="ltr" />
          </Field>
          <Field label="ملاحظات">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={!form.name || !form.phone}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
