import { PlaceInput, type PickedPlace } from '../PlaceInput';

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
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface/95 p-2 text-fg shadow-2xl backdrop-blur-md" data-testid="explore-bar">
      <div className="min-w-0 flex-1">
        <PlaceInput
          value={value}
          badge="🔍"
          badgeClass="!bg-transparent !text-muted"
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
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-lg text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 active:scale-95"
      >
        🧭
      </button>
    </div>
  );
}
