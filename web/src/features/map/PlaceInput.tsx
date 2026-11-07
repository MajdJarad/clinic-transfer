import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { newSessionToken as newSession } from './resolveAddress';

export interface PickedPlace {
  label: string;
  lat: number;
  lng: number;
}

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

interface PlaceInputProps {
  value: string;
  onChange: (text: string) => void; // user is typing (selection not made yet)
  onPick: (place: PickedPlace) => void; // a suggestion was chosen and resolved to coordinates
  onClear: () => void;
  onUseCurrentLocation?: () => void; // shows a "my location" row at the top
  placeholder: string;
  badge: string;
  badgeClass: string;
  /** Set when the text was edited but no suggestion has been chosen yet. */
  unresolved?: boolean;
}

/** Google-style place search: suggestions as you type, keyboard support, "my location" row. */
export function PlaceInput({
  value,
  onChange,
  onPick,
  onClear,
  onUseCurrentLocation,
  placeholder,
  badge,
  badgeClass,
  unresolved,
}: PlaceInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const session = useRef(newSession());
  const seq = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    if (q.length < 2) {
      seq.current++;
      setItems([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const mine = ++seq.current;
      try {
        const res = await api.geo.autocomplete(q, session.current);
        if (mine !== seq.current) return; // a newer keystroke superseded this one
        setItems(res);
        setError('');
        setActive(-1);
      } catch {
        if (mine !== seq.current) return;
        setItems([]);
        setError('تعذّر البحث، حاول مرة أخرى');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
  };

  const pick = async (s: Suggestion) => {
    setResolving(true);
    setError('');
    try {
      const place = await api.geo.place(s.placeId, session.current);
      session.current = newSession(); // a session ends once a place is chosen
      onPick({ label: place.label || s.main, lat: place.lat, lng: place.lng });
      setOpen(false);
      setItems([]);
    } catch {
      setError('تعذّر تحديد هذا المكان، اختر مكاناً آخر');
    } finally {
      setResolving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[active] ?? items[0];
      if (open && target) void pick(target);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && (items.length > 0 || loading || !!error || !!onUseCurrentLocation);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl bg-surface2 px-2.5 py-1.5 border transition focus-within:border-blue-500 ${
          unresolved ? 'border-amber-500/70' : 'border-border'
        }`}
      >
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white font-bold text-[10px] ${badgeClass}`}>
          {badge}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            search(e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-fg placeholder-muted focus:outline-none"
        />
        {(loading || resolving) && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />}
        {value && (
          <button
            type="button"
            aria-label="مسح"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setItems([]);
              inputRef.current?.focus();
            }}
            className="p-0.5 text-xs text-muted hover:text-fg"
          >
            ✕
          </button>
        )}
      </div>

      {unresolved && !showList && (
        <p className="mt-1 ps-1 text-[10px] text-amber-600">اختر مكاناً من قائمة الاقتراحات لتحديد الموقع بدقة</p>
      )}

      {showList && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 text-xs shadow-2xl"
        >
          {onUseCurrentLocation && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onUseCurrentLocation();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-blue-600 transition hover:bg-surface2"
            >
              <span className="shrink-0">🎯</span>
              <span className="font-semibold">موقعي الحالي</span>
            </button>
          )}
          {items.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(s)}
              className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start transition ${
                i === active ? 'bg-surface2' : 'hover:bg-surface2'
              }`}
            >
              <span className="mt-0.5 shrink-0">📍</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{s.main}</span>
                {s.secondary && <span className="block truncate text-[11px] text-muted">{s.secondary}</span>}
              </span>
            </button>
          ))}
          {!loading && !error && items.length === 0 && value.trim().length >= 2 && (
            <p className="px-2.5 py-2 text-muted">لا توجد نتائج</p>
          )}
          {error && <p className="px-2.5 py-2 text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
