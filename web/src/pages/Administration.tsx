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
  Textarea,
} from '../components/ui';
import type { Role, UserRecord } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppSettings {
  clinicName: string;
  defaultCountryCode: string;
  whatsappTemplate: string;

  // Map & Google Maps
  mapProvider: 'osm' | 'google';
  googleMapsApiKey: string;
  mapCenterLat: string;
  mapCenterLng: string;
  mapZoom: string;

  // Server & Database
  apiServerUrl: string;
  frontendUrl: string;
  databaseUrl: string;
  environment: 'development' | 'production';
  systemVersion: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  clinicName: 'عيادة النخبة الطبية',
  defaultCountryCode: '966',
  whatsappTemplate: `مرحباً {patientName}،

سيارة العيادة وصلت الآن إلى موقعك.
السيارة: {vehicleMake} {vehicleModel} ({vehicleColor})
رقم اللوحة: {vehiclePlate}
السائق: {driverName} - {driverPhone}

يرجى التوجه إلى السيارة. شكراً لك.`,

  mapProvider: 'osm',
  googleMapsApiKey: '',
  mapCenterLat: '41.0082',
  mapCenterLng: '28.9784',
  mapZoom: '11',

  apiServerUrl: 'http://localhost:3000',
  frontendUrl: 'http://localhost:5173',
  databaseUrl: 'file:./dev.db (SQLite)',
  environment: 'development',
  systemVersion: 'v1.0.0',
};

const SETTINGS_KEY = 'clinic_app_settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

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

// ─── Messages Tab ─────────────────────────────────────────────────────────────

function MessagesTab() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        خصّص نص رسالة التبليغ التي تُرسل للمرضى عبر واتساب. استخدم المتغيرات أدناه لإدراج البيانات تلقائياً.
      </p>

      {/* Variables reference */}
      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-fg">المتغيرات المتاحة للاستخدام في الرسالة:</p>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {[
            ['{patientName}', 'اسم المريض'],
            ['{vehicleMake}', 'ماركة السيارة'],
            ['{vehicleModel}', 'موديل السيارة'],
            ['{vehicleColor}', 'لون السيارة'],
            ['{vehiclePlate}', 'رقم اللوحة'],
            ['{driverName}', 'اسم السائق'],
            ['{driverPhone}', 'هاتف السائق'],
          ].map(([v, l]) => (
            <div key={v} className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
              <code className="text-xs text-brand-500 font-mono" dir="ltr">{v}</code>
              <span className="text-xs text-muted">{l}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Template editor */}
      <Card className="p-4">
        <Field label="نموذج رسالة الوصول (واتساب)">
          <Textarea
            rows={10}
            value={settings.whatsappTemplate}
            onChange={(e) => setSettings({ ...settings, whatsappTemplate: e.target.value })}
            className="font-mono text-sm"
          />
        </Field>
      </Card>

      {/* Preview */}
      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-fg">معاينة الرسالة (بيانات تجريبية):</p>
        <div className="whitespace-pre-wrap rounded-xl bg-green-500/10 p-4 text-sm text-fg border border-green-500/20">
          {settings.whatsappTemplate
            .replace('{patientName}', 'سارة العتيبي')
            .replace('{vehicleMake}', 'تويوتا')
            .replace('{vehicleModel}', 'كامري')
            .replace('{vehicleColor}', 'أبيض')
            .replace('{vehiclePlate}', 'ABC-1001')
            .replace('{driverName}', 'محمد أحمد')
            .replace('{driverPhone}', '0501234567')}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={reset}>إعادة للافتراضي</Button>
        <Button onClick={save}>{saved ? '✓ تم الحفظ' : 'حفظ التغييرات'}</Button>
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const save = () => {
    saveSettings(settings);
    document.title = settings.clinicName;
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <div className="space-y-6">
      {/* Clinic Profile */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <span className="text-lg">🏥</span>
          <div>
            <h3 className="text-sm font-bold text-fg">بيانات المنشأة والعيادة</h3>
            <p className="text-xs text-muted">تحديد اسم العيادة والرمز الدولي الافتراضي لأرقام الهواتف</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم العيادة / المركز الطبي">
            <Input
              value={settings.clinicName}
              onChange={(e) => setSettings({ ...settings, clinicName: e.target.value })}
              placeholder="عيادة النخبة الطبية"
            />
          </Field>
          <Field label="رمز الدولة الافتراضي (للهواتف)" hint="مثال: 966 للسعودية، 90 لتركيا، 971 للإمارات">
            <Input
              value={settings.defaultCountryCode}
              onChange={(e) => setSettings({ ...settings, defaultCountryCode: e.target.value })}
              dir="ltr"
              placeholder="966"
            />
          </Field>
        </div>
      </Card>

      {/* Map & Google Maps Subscription Settings */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗺️</span>
            <div>
              <h3 className="text-sm font-bold text-fg">إعدادات الخرائط واشتراك Google Maps</h3>
              <p className="text-xs text-muted">التبديل بين OpenStreetMap أو تفعيل Google Maps وإدخال المفتاح</p>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            settings.mapProvider === 'google'
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
            {settings.mapProvider === 'google' ? 'Google Maps مُفعّل' : 'OpenStreetMap (مجاني)'}
          </span>
        </div>

        <Field label="مزود الخريطة (Map Provider)">
          <Select
            value={settings.mapProvider}
            onChange={(e) => setSettings({ ...settings, mapProvider: e.target.value as 'osm' | 'google' })}
          >
            <option value="osm">OpenStreetMap (مجاني بالكامل - لا يحتاج اشتراك أو بطاقة)</option>
            <option value="google">Google Maps (يتطلب مفتاح API واشتراك Google Cloud)</option>
          </Select>
        </Field>

        <div className="rounded-xl border border-border/80 bg-surface2/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-fg flex items-center gap-1.5">
              <span>🔑 مفتاح Google Maps API Key</span>
              {settings.mapProvider === 'google' && (
                <span className="text-red-400 text-[11px]">* مطلوب عند اختيار Google Maps</span>
              )}
            </label>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-xs text-brand-500 hover:underline"
            >
              {showKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
            </button>
          </div>
          <Input
            type={showKey ? 'text' : 'password'}
            value={settings.googleMapsApiKey}
            onChange={(e) => setSettings({ ...settings, googleMapsApiKey: e.target.value })}
            placeholder="AIzaSy..."
            dir="ltr"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted leading-relaxed">
            للحصول على مفتاح: توجّه إلى <strong>Google Cloud Console</strong> &larr; فعّل <strong>Maps JavaScript API</strong> و <strong>Places API</strong> &larr; أنشئ مفتاح Credentials والصقه هنا.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="خط العرض الافتراضي (Latitude)">
            <Input
              value={settings.mapCenterLat}
              onChange={(e) => setSettings({ ...settings, mapCenterLat: e.target.value })}
              dir="ltr"
              placeholder="41.0082"
            />
          </Field>
          <Field label="خط الطول الافتراضي (Longitude)">
            <Input
              value={settings.mapCenterLng}
              onChange={(e) => setSettings({ ...settings, mapCenterLng: e.target.value })}
              dir="ltr"
              placeholder="28.9784"
            />
          </Field>
          <Field label="مستوى التكبير الافتراضي (Zoom)">
            <Input
              type="number"
              min="1"
              max="20"
              value={settings.mapZoom}
              onChange={(e) => setSettings({ ...settings, mapZoom: e.target.value })}
              dir="ltr"
              placeholder="11"
            />
          </Field>
        </div>
      </Card>

      {/* Server & Backend Connection */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-2.5">
          <span className="text-lg">🖥️</span>
          <div>
            <h3 className="text-sm font-bold text-fg">إعدادات الخادم وقاعدة البيانات (Server & Hosting)</h3>
            <p className="text-xs text-muted">تحديد روابط الخادم وقاعدة البيانات لربط السيرفر الخارجي أو الاستضافة مستقبلاً</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="رابط خادم الـ API (Backend URL)" hint="الخادم الذي يعالج الطلبات والبيانات">
            <Input
              value={settings.apiServerUrl}
              onChange={(e) => setSettings({ ...settings, apiServerUrl: e.target.value })}
              dir="ltr"
              placeholder="http://localhost:3000"
            />
          </Field>
          <Field label="رابط الواجهة الأمامية (Frontend URL)" hint="رابط لوحة التحكم">
            <Input
              value={settings.frontendUrl}
              onChange={(e) => setSettings({ ...settings, frontendUrl: e.target.value })}
              dir="ltr"
              placeholder="http://localhost:5173"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="سلسلة اتصال قاعدة البيانات (Database Connection / Type)" hint="مثال: SQLite أو PostgreSQL/MySQL URL">
            <Input
              value={settings.databaseUrl}
              onChange={(e) => setSettings({ ...settings, databaseUrl: e.target.value })}
              dir="ltr"
              placeholder="file:./dev.db"
            />
          </Field>
          <Field label="بيئة التشغيل (Environment)">
            <Select
              value={settings.environment}
              onChange={(e) => setSettings({ ...settings, environment: e.target.value as 'development' | 'production' })}
            >
              <option value="development">Development (تطوير محلي)</option>
              <option value="production">Production (إنتاج / سيرفر سحابي)</option>
            </Select>
          </Field>
        </div>

        <Field label="إصدار النظام (System Version)">
          <Input
            value={settings.systemVersion}
            onChange={(e) => setSettings({ ...settings, systemVersion: e.target.value })}
            dir="ltr"
            placeholder="v1.0.0"
          />
        </Field>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={reset}>
          استعادة القيم الافتراضية
        </Button>
        <Button onClick={save} className="min-w-[140px]">
          {saved ? '✓ تم الحفظ بنجاح' : 'حفظ الإعدادات'}
        </Button>
      </div>
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
