import { useState } from 'react';
import { Icon } from '../../../components/Icon';
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
      setNotice(r.status === 'requested' ? 'أُبلغ المنسق ليرسل الرسالة للمريض' : 'أُرسلت الرسالة للمريض');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذّر إرسال الرسالة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-surface2 p-3.5" data-testid="trip-bar">
      <div className="flex items-center justify-between gap-2">
        <div className={`flex min-w-0 items-center gap-2 text-sm font-medium ${toDestination ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'}`} data-testid="trip-stage">
          <Icon name={toDestination ? 'clinic' : 'heart'} className="h-4 w-4" />
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
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-600 text-sm font-medium text-white shadow-md transition hover:bg-brand-700 disabled:opacity-50"
          data-testid="trip-go"
        >
          <Icon name="compass" inline /> انطلاق
        </button>
        {!toDestination && (
          <button
            type="button"
            onClick={notify}
            disabled={busy}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 text-sm font-medium text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-60"
            data-testid="trip-notify"
          >
            {busy ? '…' : <><Icon name="send" inline />تبليغ المريض</>}
          </button>
        )}
      </div>
      {notice && (
        <p className="text-xs font-medium text-muted" data-testid="trip-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
