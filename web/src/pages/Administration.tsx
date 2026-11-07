import { useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { roleKeys } from '../labels';
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
import type { Role, UserRecord } from '../types';
import { MessagesTab, SettingsTab } from './admin/SettingsTabs';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'users' | 'messages' | 'settings' | 'roles';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'users',    label: 'الحسابات',           icon: '👥' },
  { id: 'roles',    label: 'الصلاحيات',           icon: '🔐' },
  { id: 'messages', label: 'رسائل التبليغ',       icon: '💬' },
  { id: 'settings', label: 'إعدادات التطبيق',     icon: '⚙️' },
];

const ROLES: Role[] = ['ADMIN', 'COORDINATOR', 'DRIVER'];
const emptyForm = { name: '', email: '', phone: '', password: '', role: 'DRIVER' as Role };

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.users.list().then(setUsers).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async () => {
    setError('');
    try {
      await api.users.create({ ...form });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); }
  };

  const update = async () => {
    if (!editUser) return;
    setError('');
    try {
      const payload: Record<string, unknown> = { name: editForm.name, phone: editForm.phone };
      if (editForm.password.length >= 6) payload.password = editForm.password;
      await api.users.update(editUser.id, payload);
      setEditUser(null);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); }
  };

  const toggleActive = async (u: UserRecord) => {
    await api.users.update(u.id, { active: !u.active });
    load();
  };

  const changeRole = async (u: UserRecord, role: Role) => {
    await api.users.update(u.id, { role });
    load();
  };

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setEditForm({ name: u.name, phone: u.phone ?? '', password: '' });
    setError('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">إدارة حسابات المستخدمين وتفعيلهم / تعطيلهم</p>
        <Button onClick={() => { setOpen(true); setError(''); setForm(emptyForm); }}>
          + حساب جديد
        </Button>
      </div>

      <Card className="p-4">
        {loading ? <EmptyState text={t('common.loading')} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">الاسم</th>
                  <th className="py-2 text-start font-medium">البريد</th>
                  <th className="py-2 text-start font-medium">الهاتف</th>
                  <th className="py-2 text-start font-medium">الدور</th>
                  <th className="py-2 text-start font-medium">الحالة</th>
                  <th className="py-2 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="py-3 font-medium text-fg">{u.name}</td>
                    <td className="py-3 text-muted" dir="ltr">{u.email}</td>
                    <td className="py-3 text-muted" dir="ltr">{u.phone ?? '—'}</td>
                    <td className="py-3">
                      <Select
                        className="w-36 !py-1 text-xs"
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{t(roleKeys[r])}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-3">
                      <StatusPill
                        status={u.active ? 'ACTIVE' : 'OFFLINE'}
                        label={u.active ? 'مفعّل' : 'معطّل'}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant={u.active ? 'ghost' : 'secondary'}
                          onClick={() => toggleActive(u)}
                        >
                          {u.active ? 'تعطيل' : 'تفعيل'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal open={open} title="حساب جديد" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label="الاسم الكامل">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
          </Field>
          <Field label="رقم الهاتف">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
          </Field>
          <Field label="كلمة المرور (6 أحرف على الأقل)">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" />
          </Field>
          <Field label="الدور الوظيفي">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{t(roleKeys[r])}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={create} disabled={!form.name || !form.email || form.password.length < 6}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editUser} title={`تعديل: ${editUser?.name}`} onClose={() => setEditUser(null)}>
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <Field label="الاسم الكامل">
            <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="رقم الهاتف">
            <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} dir="ltr" />
          </Field>
          <Field label="كلمة المرور الجديدة (اتركها فارغة إذا لم تريد تغييرها)">
            <Input
              type="password"
              placeholder="اتركها فارغة لإبقاء الكلمة الحالية"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              dir="ltr"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>{t('common.cancel')}</Button>
            <Button onClick={update} disabled={!editForm.name}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const roleDesc: Record<Role, { label: string; desc: string; perms: string[] }> = {
    ADMIN: {
      label: 'مدير النظام',
      desc: 'أعلى مستوى من الصلاحيات. يملك تحكماً كاملاً في جميع أقسام التطبيق.',
      perms: [
        'إنشاء / تعديل / حذف الحسابات وتغيير أدوارها',
        'إنشاء / تعديل / حذف الرحلات',
        'إدارة السائقين والمركبات',
        'تعديل الإعدادات العامة ورسائل التبليغ',
        'الوصول إلى جميع التقارير ولوحة التحكم',
        'تفعيل / تعطيل أي حساب',
      ],
    },
    COORDINATOR: {
      label: 'منسّق',
      desc: 'صلاحية تنظيمية. يدير الرحلات والتنسيق اليومي دون صلاحيات إدارة الحسابات.',
      perms: [
        'إنشاء / تعديل / حذف الرحلات',
        'إسناد السائقين والمركبات للرحلات',
        'إرسال تبليغات واتساب للمرضى',
        'عرض قائمة السائقين والمركبات (بدون تعديل)',
        'عرض لوحة التحكم والتقويم',
      ],
    },
    DRIVER: {
      label: 'سائق',
      desc: 'صلاحية محدودة. يرى رحلاته فقط ويحدّث حالتها.',
      perms: [
        'عرض الرحلات المخصصة له فقط',
        'تحديث حالة الرحلة (في الطريق / وصلت / تمت)',
        'إرسال موقعه الحالي (اختياري)',
      ],
    },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        الأدوار الوظيفية ثابتة في النظام. يمكن تغيير دور أي مستخدم من تبويب <strong>الحسابات</strong>.
      </p>
      {ROLES.map((role) => {
        const info = roleDesc[role];
        const color: Record<Role, string> = {
          ADMIN: 'border-brand-500 bg-brand-500/5',
          COORDINATOR: 'border-amber-400 bg-amber-400/5',
          DRIVER: 'border-green-400 bg-green-400/5',
        };
        return (
          <Card key={role} className={`border-s-4 p-4 ${color[role]}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-base font-bold text-fg">{info.label}</span>
              <code className="rounded bg-surface2 px-2 py-0.5 text-xs text-muted">{role}</code>
            </div>
            <p className="mb-3 text-sm text-muted">{info.desc}</p>
            <ul className="space-y-1">
              {info.perms.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-fg">
                  <span className="mt-0.5 text-green-500">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main Administration Page ─────────────────────────────────────────────────

export function Administration() {
  const [activeTab, setActiveTab] = useState<Tab>('users');

  return (
    <div className="space-y-5">
      <PageHeader
        title="الإدارة"
        subtitle="إدارة الحسابات والصلاحيات والإعدادات العامة للتطبيق"
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-accent-soft text-accent-soft-fg'
                : 'text-muted hover:bg-surface2 hover:text-fg'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'users'    && <UsersTab />}
      {activeTab === 'roles'    && <RolesTab />}
      {activeTab === 'messages' && <MessagesTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}
