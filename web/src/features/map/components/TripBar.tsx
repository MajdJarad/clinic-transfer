import { useState } from 'react';
import { api } from '../../../api';
import { StatusPill } from '../../../components/ui';
import type { Trip } from '../../../types';

interface TripBarProps {
  trip: Trip;
  /** Set off (navigate to the current target). Enabled once a route is ready. */
  onGo: () => void;
  canGo: boolean;
  statusLabel: string;
}

/**
 * What the driver needs about the trip on the map screen: which leg, the status, and the only two
 * actions: "Go" and "Notify the patient". The status itself is never tapped: it follows the car.
 */
export function TripBar({ trip, onGo, canGo, statusLabel }: TripBarProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const toDestination = trip.status === 'PICKED_UP';

  // The driver can tell the patient the car is here without ever seeing the number: the server sends it.
  const notify = async () => {
    setBusy(true);
    setNotice('');
    try {
      const r = await api.trips.notifyPatient(trip.id);
      setNotice(r.status === 'requested' ? '✓ أُبلغ المنسق ليرسل الرسالة للمريض' : '✓ أُرسلت الرسالة للمريض');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذّر إرسال الرسالة');
    } finally {
      setBusy(false);
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
        <button
          type="button"
          onClick={onGo}
          disabled={!canGo}
          className="flex-1 rounded-lg bg-blue-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-50"
          data-testid="trip-go"
        >
          🧭 انطلاق
        </button>
        {!toDestination && (
          <button
            type="button"
            onClick={notify}
            disabled={busy}
            className="flex-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
            data-testid="trip-notify"
          >
            {busy ? '…' : '📨 تبليغ المريض'}
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
