import { useState } from 'react';

export const MAP_TYPES = {
  roadmap: 'خريطة شوارع',
  satellite: 'قمر صناعي (Satellite)',
  terrain: 'تضاريس (Terrain)',
} as const;
export type MapTypeKey = keyof typeof MAP_TYPES;
export type LayerKey = 'traffic' | 'transit' | 'bicycling';

const LAYER_LABELS: Record<LayerKey, string> = {
  traffic: '🚦 حركة المرور',
  transit: '🚇 المواصلات العامة',
  bicycling: '🚲 مسارات الدراجات',
};

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

const btn = 'flex h-9 w-9 items-center justify-center p-2 text-sm text-muted transition hover:text-fg';

/** Layers menu and the round buttons on the map's corner. */
export function MapControls(p: MapControlsProps) {
  const [open, setOpen] = useState(false);
  const activeLayers = (Object.keys(p.layers) as LayerKey[]).filter((k) => p.layers[k]).length;
  return (
    <div className="absolute bottom-6 end-3 z-30 flex flex-col items-end gap-2 sm:bottom-auto sm:end-4 sm:top-4">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title="طبقات الخريطة"
          data-testid="layers-button"
          className="flex h-9 w-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface/95 p-2 text-xs font-semibold text-fg shadow-xl backdrop-blur-md transition hover:bg-surface2 sm:h-auto sm:w-auto sm:justify-start sm:px-2.5 sm:py-1.5"
        >
          <span className="text-base sm:text-sm">🗺️</span>
          <span className="hidden sm:inline">
            {MAP_TYPES[p.mapType]}
            {activeLayers > 0 ? ` +${activeLayers}` : ''}
          </span>
        </button>
        {open && (
          <div className="absolute bottom-full end-0 z-40 mb-2 flex w-52 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1 text-xs shadow-2xl sm:bottom-auto sm:top-full sm:mb-0 sm:mt-2">
            {(Object.keys(MAP_TYPES) as MapTypeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  p.onMapType(k);
                  setOpen(false);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-start text-xs font-medium transition ${p.mapType === k ? 'bg-blue-600 font-bold text-white' : 'text-fg hover:bg-surface2'}`}
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
                  className={`${i === 0 ? 'mt-1 border-t border-border' : ''} flex items-center justify-between rounded-lg px-2.5 py-1.5 text-start text-xs font-medium transition ${p.layers[k] ? 'bg-amber-600 font-bold text-white' : 'text-fg hover:bg-surface2'}`}
                >
                  <span>{LAYER_LABELS[k]}</span>
                  {p.layers[k] && <span>✓</span>}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-xl border border-border bg-surface/95 shadow-xl backdrop-blur-md">
        <button type="button" onClick={p.onLocate} title="موقعي الحالي" data-testid="locate-me" className={`${btn} border-b border-border !text-blue-600`}>
          📍
        </button>
        <button type="button" onClick={p.onStreetView} title="Street View" data-testid="streetview-button" className={`${btn} border-b border-border`}>
          🧍
        </button>
        <button type="button" onClick={p.onFit} title="تركيز على المسار" className={`${btn} border-b border-border`}>
          🎯
        </button>
        <button type="button" onClick={p.onToggleFullscreen} title={p.isFullscreen ? 'تصغير' : 'ملء الشاشة'} className={btn}>
          {p.isFullscreen ? '🗗' : '⛶'}
        </button>
      </div>

      <div className="hidden flex-col rounded-xl border border-border bg-surface/95 shadow-xl backdrop-blur-md sm:flex">
        <button type="button" onClick={() => p.onZoom(1)} className={`${btn} border-b border-border !text-base font-bold`} title="تكبير">
          +
        </button>
        <button type="button" onClick={() => p.onZoom(-1)} className={`${btn} !text-base font-bold`} title="تصغير">
          −
        </button>
      </div>
    </div>
  );
}
