import type { LatLng } from '../routeNav';
import { Icon } from '../../../components/Icon';

export interface MapPick {
  coord: LatLng;
  label: string;
  loading: boolean;
}

interface PlaceCardProps {
  place: MapPick;
  view: 'explore' | 'directions';
  onClose: () => void;
  onDirections: () => void; // explore: open directions to here
  onUseAsDestination: () => void; // directions
  onUseAsStart: () => void; // directions
  onStreetView: () => void;
  onCopy: () => void;
}

/** What Google Maps shows when you tap a point or choose a search result. */
export function PlaceCard({ place, view, onClose, onDirections, onUseAsDestination, onUseAsStart, onStreetView, onCopy }: PlaceCardProps) {
  const sec = 'flex-1 rounded-full bg-surface2 py-2.5 text-xs font-medium text-fg transition hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50';
  const pri = 'flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50';
  return (
    <div
      className="absolute inset-x-3 bottom-4 z-30 rounded-3xl bg-surface/95 p-4 text-fg shadow-float backdrop-blur-xl max-sm:me-16 sm:inset-x-0 sm:mx-auto sm:w-96"
      data-testid="picked-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold leading-snug">
          {place.loading ? <span className="animate-pulse text-muted">جارٍ تحديد العنوان…</span> : place.label}
        </p>
        <button type="button" aria-label="إغلاق" onClick={onClose} className="shrink-0 text-xs text-muted hover:text-fg">
          <Icon name="x" />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {view === 'explore' ? (
          <button type="button" disabled={place.loading} onClick={onDirections} data-testid="picked-directions" className={pri}>
            <Icon name="compass" inline /> الاتجاهات
          </button>
        ) : (
          <>
            <button type="button" disabled={place.loading} onClick={onUseAsDestination} data-testid="picked-to" className={pri}>
              اجعلها الوجهة
            </button>
            <button type="button" disabled={place.loading} onClick={onUseAsStart} data-testid="picked-from" className={sec}>
              نقطة الانطلاق
            </button>
          </>
        )}
        <button type="button" onClick={onStreetView} title="Street View" data-testid="picked-streetview" className={`${sec} max-w-[3rem]`}>
          <Icon name="walk" />
        </button>
        <button type="button" onClick={onCopy} title="نسخ رابط الموقع" data-testid="picked-copy" className={`${sec} max-w-[3rem]`}>
          <Icon name="link" />
        </button>
      </div>
    </div>
  );
}
