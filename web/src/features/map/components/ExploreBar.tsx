import { PlaceInput, type PickedPlace } from '../PlaceInput';
import { Icon } from '../../../components/Icon';
import { MAP_PANEL } from '../mapUi';

interface ExploreBarProps {
  value: string;
  onChange: (text: string) => void;
  onPick: (place: PickedPlace) => void;
  onClear: () => void;
  onDirections: () => void;
}

/** The map's home state, like Google Maps: one search box and a button that opens directions. */
export function ExploreBar({ value, onChange, onPick, onClear, onDirections }: ExploreBarProps) {
  return (
    <div className={`relative flex h-12 items-center gap-2 rounded-full ps-4 pe-1 transition focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--ring)_22%,transparent)] sm:h-14 ${MAP_PANEL}`} data-testid="explore-bar">
      <div className="min-w-0 flex-1">
        <PlaceInput
          value={value}
          variant="bare"
          badge={<Icon name="search" className="h-5 w-5" />}
          badgeClass="!bg-transparent !text-muted !w-5"
          placeholder="ابحث في الخرائط…"
          onChange={onChange}
          onPick={onPick}
          onClear={onClear}
        />
      </div>
      <button
        type="button"
        onClick={onDirections}
        title="الاتجاهات"
        aria-label="الاتجاهات"
        data-testid="open-directions"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-md transition hover:bg-brand-700 active:scale-95 sm:h-12 sm:w-12"
      >
        <Icon name="compass" className="h-5 w-5" />
      </button>
    </div>
  );
}
