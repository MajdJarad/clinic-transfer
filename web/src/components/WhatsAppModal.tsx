import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArrivalMessage, Trip } from '../types';
import { useI18n } from '../i18n';
import { Button, ErrorText, Field, Modal, Textarea } from './ui';

export function WhatsAppModal({
  trip,
  onClose,
}: {
  trip: Trip | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<ArrivalMessage | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!trip) return;
    setData(null);
    setError('');
    setCopied(false);
    api.trips
      .arrivalMessage(trip.id)
      .then((res) => {
        setData(res);
        setText(res.text);
      })
      .catch((e) => setError(e.message));
  }, [trip]);

  // Exactly the stored digits: nothing is added. A number saved without its country code gets no link.
  const link = data?.phoneValid ? `https://wa.me/${data.normalizedPhone}?text=${encodeURIComponent(text)}` : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t('wa.copyFailed'));
    }
  };

  return (
    <Modal open={!!trip} title={t('wa.title')} onClose={onClose}>
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <p className="text-sm text-muted">{t('wa.preparing')}</p>}
      {data && (
        <div className="space-y-4">
          <Field label={t('wa.phone')}>
            <div className="rounded-lg bg-surface2 px-3 py-2 text-sm text-fg" dir="ltr">
              {data.normalizedPhone}
            </div>
          </Field>
          <Field label={t('wa.message')}>
            <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copy}>
              {copied ? t('wa.copied') : t('wa.copy')}
            </Button>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex"
                onClick={() => {
                  // Sent by hand: clear the driver's request, if there was one.
                  if (trip) void api.trips.markPatientNoticeSent(trip.id).catch(() => {});
                }}
              >
                <Button variant="success">{t('wa.open')}</Button>
              </a>
            ) : null}
          </div>
          {!data.phoneValid && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs font-semibold text-amber-700" data-testid="phone-invalid">
              ⚠️ الرقم محفوظ بلا رمز الدولة ولا يمكن فتح واتساب به. عدّل الرحلة واكتب الرقم مع رمز الدولة (مثل +905331234567).
            </p>
          )}
          <p className="text-xs text-muted">{t('wa.note')}</p>
        </div>
      )}
    </Modal>
  );
}
