import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { MAP_BTN, MAP_PANEL } from '../mapUi';

export const MAP_TYPES = {
  roadmap: 'خريطة شوارع',
  satellite: 'قمر صناعي (Satellite)',
  terrain: 'تضاريس (Terrain)',
} as const;
export type MapTypeKey = keyof typeof MAP_TYPES;
export type LayerKey = 'traffic' | 'transit' | 'bicycling';

const LAYER_LABELS: Record<LayerKey, string> = {
  traffic: 'حركة المرور',
  transit: 'المواصلات العامة',
  bicycling: 'مسارات الدراجات',
};

const LAYER_ICONS: Record<LayerKey, string> = { traffic: 'traffic', transit: 'train', bicycling: 'bike' };

interface MapControlsProps {
  ready: boolean;
  mapType: MapTypeKey;
  onMapType: (t: MapTypeKey) => void;
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (k: LayerKey) => void;
  onLocate: () => void;
  onFit: () => void;
  onStreetView: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onZoom: (delta: number) => void;
}

const round = MAP_BTN;

/** Layers menu and the round buttons at the map's corner. */
export function MapControls(p: MapControlsProps) {
  const [open, setOpen] = useState(false);
  const activeLayers = (Object.keys(p.layers) as LayerKey[]).filter((k) => p.layers[k]).length;
  return (
    <div className="absolute bottom-[var(--map-controls-bottom,0.75rem)] end-3 z-30 flex flex-row items-center gap-2.5 sm:bottom-auto sm:end-4 sm:top-4 sm:flex-col sm:items-end">
      <div className="relative max-sm:static">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title="طبقات الخريطة"
          data-testid="layers-button"
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-surface text-sm font-medium text-fg shadow-float transition hover:bg-surface2 active:scale-95 sm:h-11 sm:w-auto sm:px-4"
        >
          <Icon name="layers" className="h-5 w-5" />
          <span className="hidden sm:inline">
            {MAP_TYPES[p.mapType]}
            {activeLayers > 0 ? ` +${activeLayers}` : ''}
          </span>
        </button>
        {open && (
          <div className={`absolute bottom-full end-0 z-40 mb-3 flex w-60 flex-col gap-1 ${MAP_PANEL} p-2 text-xs sm:bottom-auto sm:top-full sm:mb-0 sm:mt-3`}>
            {(Object.keys(MAP_TYPES) as MapTypeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  p.onMapType(k);
                  setOpen(false);
                }}
                className={`rounded-2xl px-3.5 py-2.5 text-start text-[13px] font-medium transition ${p.mapType === k ? 'bg-brand-600 text-white shadow-md' : 'text-fg hover:bg-surface2'}`}
              >
                {MAP_TYPES[k]}
              </button>
            ))}
            {p.ready &&
              (Object.keys(LAYER_LABELS) as LayerKey[]).map((k, i) => (
                <button
                  key={k}
                  onClick={() => p.onToggleLayer(k)}
                  data-testid={`layer-${k}`}
                  aria-pressed={p.layers[k]}
                  className={`${i === 0 ? 'mt-1' : ''} flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-start text-[13px] font-medium transition ${p.layers[k] ? 'bg-[var(--tint-butter)] text-amber-800 dark:text-amber-200' : 'text-fg hover:bg-surface2'}`}
                >
                  <span className="flex items-center gap-2"><Icon name={LAYER_ICONS[k]} className="h-4 w-4" />{LAYER_LABELS[k]}</span>
                  {p.layers[k] && <Icon name="check" className="h-4 w-4" />}
                </button>
              ))}
          </div>
        )}
      </div>

      <button type="button" onClick={p.onLocate} title="موقعي الحالي" data-testid="locate-me" className={`${round} !bg-brand-600 !text-white hover:!bg-brand-700`}>
        <Icon name="pin" className="h-5 w-5" />
      </button>
      <button type="button" onClick={p.onStreetView} title="Street View" data-testid="streetview-button" className={round}>
        <Icon name="walk" className="h-5 w-5" />
      </button>
      <button type="button" onClick={p.onFit} title="تركيز على المسار" className={round}>
        <Icon name="target" className="h-5 w-5" />
      </button>
      <button type="button" onClick={p.onToggleFullscreen} title={p.isFullscreen ? 'تصغير' : 'ملء الشاشة'} className={round}>
        <Icon name={p.isFullscreen ? 'shrink' : 'expand'} className="h-5 w-5" />
      </button>

      <div className="hidden flex-col overflow-hidden rounded-full bg-surface shadow-float sm:flex">
        <button type="button" onClick={() => p.onZoom(1)} className="grid h-11 w-11 place-items-center text-fg transition hover:bg-surface2" title="تكبير" aria-label="تكبير">
          <Icon name="plus" className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => p.onZoom(-1)} className="grid h-11 w-11 place-items-center text-fg transition hover:bg-surface2" title="تصغير" aria-label="تصغير">
          <span className="block h-[1.7px] w-[14px] rounded bg-current" />
        </button>
      </div>
    </div>
  );
}
