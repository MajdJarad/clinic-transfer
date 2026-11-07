import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components/ui';
import type { AlertItem, AlertType } from '../../types';
import { ALERT_STATUS_LABEL, ALERT_TYPES, alertTypeIcon, alertTypeLabel } from './labels';

const POLL_MS = 6000;

/**
 * The driver's emergency button, always in the header. One tap opens the sheet; choosing what happened
 * and sending it puts a loud, persistent alert in front of every coordinator, stamped with the driver's
 * position and current trip. The driver sees when someone has taken it over.
 */
export function DriverAlertButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AlertType | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState<AlertItem[]>([]);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      if (document.visibilityState === 'hidden') return;
      api.alerts.mine().then((a) => alive && setMine(a)).catch(() => {});
    };
    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const active = mine.find((a) => a.status !== 'RESOLVED');

  const send = async () => {
    if (!type) return;
    setBusy(true);
    setError('');
    try {
      // The position at this very moment (the server falls back to the last one it knows).
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 4000, maximumAge: 15000 });
      });
      const created = await api.alerts.create({ type, note: note.trim() || undefined, lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null });
      setMine((m) => [created, ...m.filter((x) => x.id !== created.id)]);
      setType(null);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر إرسال الإنذار، حاول مرة أخرى أو اتصل بالمنسق');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-lg border px-2.5 py-1 text-xs font-black text-white shadow ${
          active ? 'animate-pulse border-red-300 bg-red-700' : 'border-red-400/60 bg-red-600 hover:bg-red-700'
        }`}
        data-testid="alert-button"
      >
        {active ? '🚨 أُرسل' : '🚨 إنذار'}
      </button>

      <Modal open={open} title="🚨 إنذار عاجل للمنسق" onClose={() => setOpen(false)}>
        <div className="space-y-4" data-testid="alert-sheet">
          {active && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:bg-red-500/10" data-testid="alert-status">
              <p className="font-black text-red-700 dark:text-red-300">
                {alertTypeIcon(active.type)} {alertTypeLabel(active.type)}
              </p>
              <p className="mt-1 text-xs font-semibold text-fg">
                {active.status === 'ACKNOWLEDGED' ? `✓ ${active.acknowledgedBy ?? 'المنسق'} استلم الإنذار وهو يتابع معك` : '⏳ تم الإرسال، بانتظار أن يستلمه المنسق…'}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{ALERT_STATUS_LABEL[active.status]}</p>
            </div>
          )}

          <p className="text-sm font-semibold text-fg">ماذا حدث؟</p>
          <div className="grid grid-cols-2 gap-2">
            {ALERT_TYPES.map((a) => (
              <button
                key={a.type}
                type="button"
                onClick={() => setType(a.type)}
                aria-pressed={type === a.type}
                data-testid={`alert-type-${a.type}`}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-bold transition ${
                  type === a.type ? 'border-red-600 bg-red-600 text-white' : 'border-border bg-surface2 text-fg hover:border-red-400'
                }`}
              >
                <span className="text-2xl">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="تفاصيل إضافية (اختياري)…"
            className="w-full rounded-xl border border-border bg-surface2 p-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-red-400"
            data-testid="alert-note"
          />
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <button
            type="button"
            onClick={send}
            disabled={!type || busy}
            className="w-full rounded-xl bg-red-600 py-3.5 text-base font-black text-white shadow-lg shadow-red-600/30 transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-50"
            data-testid="alert-send"
          >
            {busy ? 'جارٍ الإرسال…' : '🚨 إرسال الإنذار الآن'}
          </button>
          <p className="text-center text-[11px] text-muted">يصل فوراً لكل المنسقين مع موقعك الحالي ورحلتك.</p>
        </div>
      </Modal>
    </>
  );
}
