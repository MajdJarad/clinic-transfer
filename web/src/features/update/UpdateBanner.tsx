import { useEffect, useState } from 'react';

/** The hashed main script this page was loaded with, e.g. "index-DHL2oJty" (null in dev). */
function loadedBuild(): string | null {
  for (const s of Array.from(document.scripts)) {
    const m = /assets\/(index-[\w-]+)\.js/.exec(s.src);
    if (m) return m[1];
  }
  return null;
}

/**
 * A page left open (or kept by the browser) can run an old version for days.
 * Compare with what the server serves now and offer a one-tap reload.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = loadedBuild();
    if (!mine) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((h: { webBuild?: string | null } | null) => {
          if (alive && h?.webBuild && h.webBuild !== mine) setStale(true);
        })
        .catch(() => undefined);
    };
    check();
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!stale) return null;
  return (
    <div
      role="alert"
      data-testid="update-banner"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-2xl"
    >
      <span>🔄 يتوفر إصدار أحدث من التطبيق</span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-white px-3 py-1 text-xs font-black text-blue-700" data-testid="update-reload">
        تحديث الآن
      </button>
    </div>
  );
}
