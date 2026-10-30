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

  const link = data ? `https://wa.me/${data.normalizedPhone}?text=${encodeURIComponent(text)}` : '#';

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
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex">
              <Button variant="success">{t('wa.open')}</Button>
            </a>
          </div>
          <p className="text-xs text-muted">{t('wa.note')}</p>
        </div>
      )}
    </Modal>
  );
}
