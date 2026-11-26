import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { api } from '../../api';
import { Modal } from '../../components/ui';
import type { AlertItem, AlertType } from '../../types';
import { ALERT_STATUS_LABEL, ALERT_TYPES, alertTypeIcon, alertTypeLabel } from './labels';

const POLL_MS = 6000;

type Contacts = { groupCall: string | null; contacts: { id: string; name: string; role: string; phone: string }[] };
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

/**
 * The driver's emergency button, always in the header. One tap opens the sheet; choosing what happened and
 * sending it (after one more tap to confirm, so it can never go by accident) puts a loud, persistent alert in
 * front of every coordinator, stamped with the driver's position and current trip. Help by phone is one tap
 * away at every step: the group-call line the admin set, and each coordinator's number. The driver sees when
 * someone has taken it over.
 */
export function DriverAlertButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AlertType | null>(null);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mine, setMine] = useState<AlertItem[]>([]);
  const [calls, setCalls] = useState<Contacts | null>(null);
  const [showList, setShowList] = useState(false);

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

  // Who can be called, loaded when the sheet opens.
  useEffect(() => {
    if (!open) return;
    api.alerts.contacts().then(setCalls).catch(() => {});
  }, [open]);

  const active = mine.find((a) => a.status !== 'RESOLVED');
  const close = () => {
    setOpen(false);
    setConfirming(false);
    setShowList(false);
  };

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
      setConfirming(false);
    } catch (e) {
      setConfirming(false);
      setError(e instanceof Error ? e.message : 'تعذّر إرسال الإنذار، حاول مرة أخرى أو اتصل بالمنسق');
    } finally {
      setBusy(false);
    }
  };

  const group = calls?.groupCall ?? null;
  const groupIsLink = !!group && /^https?:\/\//i.test(group);
  const callBtn = 'flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface2 text-sm font-medium text-fg transition active:scale-[0.99]';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition ${
          active ? 'bg-red-600 text-white shadow-md' : 'bg-[var(--tint-rose)] text-red-700 hover:bg-red-100 dark:text-red-300'
        }`}
        data-testid="alert-button"
      >
        <Icon name="alert" className="h-4 w-4" />
        {active ? 'أُرسل' : 'إنذار'}
      </button>

      <Modal open={open} title="إنذار عاجل للمنسق" onClose={close}>
        <div className="space-y-4" data-testid="alert-sheet">
          {active && (
            <div className="rounded-2xl bg-[var(--tint-rose)] p-3.5 text-sm" data-testid="alert-status">
              <p className="font-semibold text-red-700 dark:text-red-300">
                <Icon name={alertTypeIcon(active.type)} inline /> {alertTypeLabel(active.type)}
              </p>
              <p className="mt-1 text-xs font-medium text-fg">
                {active.status === 'ACKNOWLEDGED' ? `${active.acknowledgedBy ?? 'المنسق'} استلم الإنذار وهو يتابع معك` : 'تم الإرسال، بانتظار أن يستلمه المنسق…'}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{ALERT_STATUS_LABEL[active.status]}</p>
            </div>
          )}

          {!confirming ? (
            <>
              <p className="text-sm font-medium text-fg">ماذا حدث؟</p>
              <div className="grid grid-cols-2 gap-2.5">
                {ALERT_TYPES.map((a) => (
                  <button
                    key={a.type}
                    type="button"
                    onClick={() => setType(a.type)}
                    aria-pressed={type === a.type}
                    data-testid={`alert-type-${a.type}`}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-xs font-medium transition ${
                      type === a.type ? 'bg-red-600 text-white shadow-md' : 'bg-surface2 text-fg hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon name={a.icon} className="h-6 w-6" />
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
                className="w-full rounded-2xl bg-surface2 p-3.5 text-sm text-fg outline-none focus:ring-4 focus:ring-red-400/25"
                data-testid="alert-note"
              />
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!type || busy}
                className="h-12 w-full rounded-full bg-red-600 text-base font-medium text-white shadow-md transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-50"
                data-testid="alert-send"
              >
                إرسال الإنذار
              </button>
            </>
          ) : (
            <div className="space-y-3" data-testid="alert-confirm-panel">
              <div className="rounded-2xl bg-[var(--tint-butter)] p-4 text-center">
                <p className="text-base font-semibold text-fg">هل تريد إرسال الإنذار الآن؟</p>
                <p className="mt-1.5 text-sm text-fg">
                  <Icon name={alertTypeIcon(type ?? 'OTHER')} inline /> {alertTypeLabel(type ?? 'OTHER')}
                </p>
                {note.trim() && <p className="mt-1 text-xs text-muted">«{note.trim()}»</p>}
                <p className="mt-2 text-xs text-muted">سيصل فوراً لكل المنسقين مع موقعك الحالي ورحلتك، وسيدوّي إنذار عندهم حتى يستلموه.</p>
              </div>
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="h-12 w-full rounded-full bg-red-600 text-base font-medium text-white shadow-md transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-60"
                data-testid="alert-confirm"
              >
                {busy ? 'جارٍ الإرسال…' : 'نعم، أرسل الإنذار الآن'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={callBtn} data-testid="alert-back">
                رجوع
              </button>
            </div>
          )}

          {/* Help by phone, one tap: the group-call line the admin set, and each coordinator. */}
          <div className="space-y-2 border-t border-border pt-4" data-testid="alert-calls">
            <p className="text-xs font-medium text-muted">أو اتصل مباشرة</p>
            {group ? (
              <a
                href={groupIsLink ? group : telHref(group)}
                {...(groupIsLink ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-medium text-white shadow-md transition active:scale-[0.99]"
                data-testid="alert-groupcall"
              >
                <Icon name="phone" className="h-[18px] w-[18px]" /> اتصال جماعي فوري
              </a>
            ) : (
              <button type="button" onClick={() => setShowList((v) => !v)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--tint-sage)] text-sm font-medium text-emerald-800 transition active:scale-[0.99] dark:text-emerald-200" data-testid="alert-groupcall">
                <Icon name="users" className="h-[18px] w-[18px]" /> اتصال جماعي فوري
              </button>
            )}
            {(showList || group) && calls && calls.contacts.length > 0 && (
              <ul className="space-y-1.5" data-testid="alert-contacts">
                {calls.contacts.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface2 px-3.5 py-2">
                    <span className="min-w-0 text-sm text-fg">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block text-[11px] text-muted">{c.role === 'ADMIN' ? 'المدير' : 'منسق'}</span>
                    </span>
                    <a href={telHref(c.phone)} aria-label={`اتصال ${c.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-md" data-testid={`alert-call-${c.id}`}>
                      <Icon name="phone" className="h-[18px] w-[18px]" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {!group && showList && calls && calls.contacts.length === 0 && <p className="text-xs text-muted">لا توجد أرقام للمنسقين بعد. اطلب من المدير إضافتها.</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
