import { useState } from 'react';
import { api } from '../../../api';
import { StatusPill } from '../../../components/ui';
import { NEXT_ACTION } from '../../../lib/tripFlow';
import type { Trip } from '../../../types';

interface TripBarProps {
  trip: Trip;
  onAdvance: (trip: Trip) => Promise<void>;
  statusLabel: string;
}

/** What the driver needs about the trip on the map screen: which leg, the status, and the two actions. */
export function TripBar({ trip, onAdvance, statusLabel }: TripBarProps) {
  const [busy, setBusy] = useState<'advance' | 'notify' | null>(null);
  const [notice, setNotice] = useState('');
  const next = NEXT_ACTION[trip.status];
  const toDestination = trip.status === 'PICKED_UP';

  const advance = async () => {
    setBusy('advance');
    try {
      await onAdvance(trip);
    } finally {
      setBusy(null);
    }
  };

  // The driver can tell the patient the car is here without ever seeing the number: the server sends it.
  const notify = async () => {
    setBusy('notify');
    setNotice('');
    try {
      const r = await api.trips.notifyPatient(trip.id);
      setNotice(r.status === 'requested' ? '✓ أُبلغ المنسق ليرسل الرسالة للمريض' : '✓ أُرسلت الرسالة للمريض');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذّر إرسال الرسالة');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface2/70 p-2.5" data-testid="trip-bar">
      <div className="flex items-center justify-between gap-2">
        <div className={`min-w-0 text-xs font-bold ${toDestination ? 'text-emerald-700' : 'text-blue-700'}`} data-testid="trip-stage">
          <span>{toDestination ? '🏥' : '🧑‍⚕️'} </span>
          <span className="truncate">
            {toDestination ? 'التوجه إلى الوجهة' : 'التوجه إلى المريض'} • {trip.patientName}
          </span>
        </div>
        <StatusPill status={trip.status} label={statusLabel} />
      </div>
      <div className="flex gap-2">
        {next && (
          <button
            type="button"
            onClick={advance}
            disabled={busy !== null}
            className="flex-1 rounded-lg bg-brand-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            data-testid="trip-next"
          >
            {busy === 'advance' ? '…' : next.label}
          </button>
        )}
        {!toDestination && (
          <button
            type="button"
            onClick={notify}
            disabled={busy !== null}
            className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            data-testid="trip-notify"
          >
            {busy === 'notify' ? '…' : '📨 إشعار المريض بوصول السيارة'}
          </button>
        )}
      </div>
      {notice && (
        <p className="text-[11px] font-semibold text-muted" data-testid="trip-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
