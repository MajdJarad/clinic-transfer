import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { refreshConfig } from '../../config';
import { Button, Card, EmptyState, ErrorText, Field, Input, Textarea } from '../../components/ui';
import type { AppSettings, SystemInfo } from '../../types';

// Settings live on the server (Setting table). What is saved here is what the backend actually uses:
// the WhatsApp text when it builds messages, the clinic name and map center for every screen.

interface Loaded {
  settings: AppSettings;
  defaults: AppSettings;
  system: SystemInfo;
}

function useServerSettings() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.settings
      .get()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذّر تحميل الإعدادات'));
  }, []);
  return { data, setData, error };
}

const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} يوم ${h} س` : h ? `${h} س ${m} د` : `${m} د`;
};

function SaveBar({ busy, saved, onSave, onReset, error }: { busy: boolean; saved: boolean; onSave: () => void; onReset: () => void; error: string }) {
  return (
    <div className="space-y-2">
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between pt-1">
        <Button variant="secondary" onClick={onReset} disabled={busy}>
          استعادة القيم الافتراضية
        </Button>
        <Button onClick={onSave} loading={busy} className="min-w-[140px]" data-testid="settings-save">
          {saved ? '✓ تم الحفظ' : 'حفظ'}
        </Button>
      </div>
    </div>
  );
}

// ─── Messages (WhatsApp template) ─────────────────────────────────────────────

const VARIABLES: [string, string][] = [
  ['patientName', 'اسم المريض'],
  ['vehicleMake', 'ماركة السيارة'],
  ['vehicleModel', 'موديل السيارة'],
  ['vehicleColor', 'لون السيارة'],
  ['vehiclePlate', 'رقم اللوحة'],
  ['driverName', 'اسم السائق'],
  ['driverPhone', 'هاتف السائق'],
];

export function MessagesTab() {
  const { data, setData, error: loadError } = useServerSettings();
  const [template, setTemplate] = useState('');
  const [preview, setPreview] = useState('');
  const [unknown, setUnknown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLTextAreaElement | null>(null); // the Textarea component does not forward refs
  const sel = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (data) setTemplate(data.settings.whatsappTemplate);
  }, [data]);

  // Live preview rendered by the server, with the exact code that builds real messages.
  useEffect(() => {
    if (!data) return;
    const id = setTimeout(() => {
      api.settings
        .preview(template)
        .then((r) => {
          setPreview(r.text);
          setUnknown(r.unknown);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [template, data]);

  const insert = (name: string) => {
    const el = box.current;
    const token = `{${name}}`;
    if (!el || !sel.current) return setTemplate((t) => t + token);
    const [a, b] = sel.current;
    setTemplate(template.slice(0, a) + token + template.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
      sel.current = [a + token.length, a + token.length];
    });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.settings.update({ whatsappTemplate: template });
      setData((d) => (d ? { ...d, settings: r.settings } : d));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorText>{loadError}</ErrorText>;
  if (!data) return <EmptyState text="جارٍ التحميل…" />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        نص رسالة الوصول التي تُرسل للمريض عبر واتساب. يُحفظ على الخادم ويُستخدم في كل رسالة جديدة.
      </p>

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-fg">اضغط على متغير لإدراجه في الرسالة:</p>
        <div className="flex flex-wrap gap-2">
          {VARIABLES.map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => insert(v)}
              className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2 text-start transition hover:bg-accent-soft"
            >
              <code className="font-mono text-xs text-brand-500" dir="ltr">{`{${v}}`}</code>
              <span className="text-xs text-muted">{l}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <Field label="نموذج رسالة الوصول (واتساب)">
          <Textarea
            rows={10}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            onSelect={(e) => {
              box.current = e.currentTarget;
              sel.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
            }}
            className="font-mono text-sm"
            data-testid="template-input"
          />
        </Field>
        {unknown.length > 0 && (
          <p className="mt-2 text-xs text-amber-600" data-testid="template-unknown">
            ⚠️ متغيرات غير معروفة ستصل للمريض كما هي: {unknown.map((u) => `{${u}}`).join(' ')}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-fg">معاينة الرسالة (بيانات تجريبية):</p>
        <div className="whitespace-pre-wrap rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-fg" data-testid="template-preview">
          {preview}
        </div>
      </Card>

      <SaveBar busy={busy} saved={saved} error={error} onSave={save} onReset={() => setTemplate(data.defaults.whatsappTemplate)} />
    </div>
  );
}

// ─── General settings + system status ─────────────────────────────────────────

export function SettingsTab() {
  const { data, setData, error: loadError } = useServerSettings();
  const [form, setForm] = useState({ clinicName: '', mapCenterLat: '', mapCenterLng: '', mapZoom: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fill = (s: AppSettings) =>
    setForm({
      clinicName: s.clinicName,
      mapCenterLat: String(s.mapCenterLat),
      mapCenterLng: String(s.mapCenterLng),
      mapZoom: String(s.mapZoom),
    });
  useEffect(() => {
    if (data) fill(data.settings);
  }, [data]);

  const patch = useMemo(
    () => ({
      clinicName: form.clinicName,
      mapCenterLat: Number(form.mapCenterLat),
      mapCenterLng: Number(form.mapCenterLng),
      mapZoom: Number(form.mapZoom),
    }),
    [form],
  );

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.settings.update(patch);
      setData((d) => (d ? { ...d, settings: r.settings } : d));
      await refreshConfig(); // the sidebar name, tab title and map defaults update immediately
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('استعادة كل الإعدادات (الاسم، الخريطة، ونص الرسالة) إلى القيم الافتراضية؟')) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.settings.reset();
      setData((d) => (d ? { ...d, settings: r.settings } : d));
      await refreshConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت الاستعادة');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorText>{loadError}</ErrorText>;
  if (!data) return <EmptyState text="جارٍ التحميل…" />;
  const sys = data.system;

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="border-b border-border pb-2.5">
          <h3 className="text-sm font-bold text-fg">🏥 بيانات العيادة</h3>
          <p className="text-xs text-muted">تظهر في الشريط الجانبي وصفحة الدخول وعنوان التبويب.</p>
        </div>
        <div className="grid gap-4">
          <Field label="اسم العيادة">
            <Input value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} data-testid="clinic-name" />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="border-b border-border pb-2.5">
          <h3 className="text-sm font-bold text-fg">🗺️ الخريطة</h3>
          <p className="text-xs text-muted">المكان الذي تفتح عليه الخريطة، ومنه يُفضَّل البحث عن الأماكن.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="خط العرض (Latitude)">
            <Input value={form.mapCenterLat} onChange={(e) => setForm({ ...form, mapCenterLat: e.target.value })} dir="ltr" placeholder="41.0082" data-testid="map-lat" />
          </Field>
          <Field label="خط الطول (Longitude)">
            <Input value={form.mapCenterLng} onChange={(e) => setForm({ ...form, mapCenterLng: e.target.value })} dir="ltr" placeholder="28.9784" data-testid="map-lng" />
          </Field>
          <Field label="التكبير (1 - 20)">
            <Input type="number" min="1" max="20" value={form.mapZoom} onChange={(e) => setForm({ ...form, mapZoom: e.target.value })} dir="ltr" data-testid="map-zoom" />
          </Field>
        </div>
      </Card>

      <SaveBar busy={busy} saved={saved} error={error} onSave={save} onReset={reset} />

      <Card className="space-y-3 p-5">
        <span data-testid="system-status" className="hidden" />
        <div className="border-b border-border pb-2.5">
          <h3 className="text-sm font-bold text-fg">🖥️ حالة النظام</h3>
          <p className="text-xs text-muted">للقراءة فقط، من الخادم الفعلي. تُضبط من إعدادات الاستضافة (متغيرات البيئة).</p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {([
            ['الإصدار', sys.version],
            ['البيئة', sys.environment === 'production' ? 'إنتاج' : 'تطوير'],
            ['مدة التشغيل', fmtUptime(sys.uptimeSeconds)],
            ['Node', sys.node],
            ['قاعدة البيانات', `${sys.database.provider} (${sys.database.file})`],
            ['خرائط Google', sys.google.mapsConfigured ? '✅ مفتاح الخادم مضبوط' : '❌ المفتاح غير مضبوط (GOOGLE_MAPS_API_KEY)'],
            ['خريطة متجهة (Map ID)', sys.google.mapIdConfigured ? '✅ مفعّل (تدوير مع اتجاه السير)' : 'غير مضبوط (اختياري: GOOGLE_MAP_ID)'],
            ['تتبع Traccar', sys.traccarEnabled ? '✅ مفعّل' : 'غير مفعّل'],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 rounded-lg bg-surface2 px-3 py-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="text-xs font-medium text-fg" dir="auto">{v}</dd>
            </div>
          ))}
        </dl>
        {sys.database.mayBeEphemeral && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300" data-testid="ephemeral-warning">
            ⚠️ قاعدة البيانات ملف داخل حاوية الخادم. على الاستضافات المجانية يُفقد هذا الملف (الرحلات والإعدادات) عند كل نشر أو إعادة تشغيل. لحفظ البيانات
            أضف قرصاً دائماً واضبط <code dir="ltr">DATABASE_URL=file:/data/clinic.db</code>.
          </p>
        )}
      </Card>
    </div>
  );
}
