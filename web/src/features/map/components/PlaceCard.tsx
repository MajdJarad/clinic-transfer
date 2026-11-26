import type { LatLng } from '../routeNav';
import { Icon } from '../../../components/Icon';
import { MAP_COL, MAP_PANEL } from '../mapUi';

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
  const sec = 'flex h-11 flex-1 items-center justify-center rounded-full bg-surface2 text-sm font-medium text-fg transition hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50';
  const pri = 'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-600 text-sm font-medium text-white shadow-md transition hover:bg-brand-700 disabled:opacity-50';
  const icon = 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface2 text-fg transition hover:bg-slate-200 dark:hover:bg-slate-700';
  return (
    <div
      className={`absolute inset-x-3 bottom-4 z-30 ${MAP_PANEL} p-4 max-sm:bottom-[calc(var(--map-controls-bottom,0.75rem)+3.5rem)] sm:inset-x-auto sm:start-4 sm:bottom-4 ${MAP_COL}`}
      data-testid="picked-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-snug">
          {place.loading ? <span className="animate-pulse text-muted">جارٍ تحديد العنوان…</span> : place.label}
        </p>
        <button type="button" aria-label="إغلاق" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface2 text-muted transition hover:text-fg">
          <Icon name="x" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {view === 'explore' ? (
          <button type="button" disabled={place.loading} onClick={onDirections} data-testid="picked-directions" className={pri}>
            <Icon name="compass" className="h-[18px] w-[18px]" /> الاتجاهات
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
        <button type="button" onClick={onStreetView} title="Street View" data-testid="picked-streetview" className={icon}>
          <Icon name="walk" className="h-5 w-5" />
        </button>
        <button type="button" onClick={onCopy} title="نسخ رابط الموقع" data-testid="picked-copy" className={icon}>
          <Icon name="link" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
