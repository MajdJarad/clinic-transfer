export type Freshness = 'live' | 'recent' | 'stale' | 'none';

export const LIVE_SECONDS = 30; // a phone that reports every few seconds is "live" within this
export const RECENT_SECONDS = 300;

export function freshnessOf(ageSeconds: number | null): Freshness {
  if (ageSeconds == null) return 'none';
  if (ageSeconds <= LIVE_SECONDS) return 'live';
  if (ageSeconds <= RECENT_SECONDS) return 'recent';
  return 'stale';
}

/** "قبل 4 ث" / "قبل 3 د" / "قبل ساعتين". */
export function ageLabel(ageSeconds: number | null): string {
  if (ageSeconds == null) return 'لا يوجد موقع';
  if (ageSeconds < 5) return 'الآن';
  if (ageSeconds < 60) return `قبل ${Math.round(ageSeconds)} ث`;
  const m = Math.round(ageSeconds / 60);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  return h < 24 ? `قبل ${h} س` : `قبل ${Math.round(h / 24)} يوم`;
}

export const FRESHNESS_COLOR: Record<Freshness, string> = {
  live: '#16a34a',
  recent: '#f59e0b',
  stale: '#6b7280',
  none: '#6b7280',
};
