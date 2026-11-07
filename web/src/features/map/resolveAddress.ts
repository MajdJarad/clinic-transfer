import { api } from '../../api';

/** Places "session" tokens group an autocomplete + details lookup into one billed session. */
export const newSessionToken = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Best-effort geocoding of free text (e.g. an address typed when the trip was created, before
 * coordinates were saved). Returns null when nothing sensible is found - callers must then ask the
 * user to choose a place instead of guessing.
 */
export async function resolveAddress(text: string): Promise<{ lat: number; lng: number } | null> {
  const q = text.trim();
  if (q.length < 2) return null;
  const session = newSessionToken();
  try {
    const suggestions = await api.geo.autocomplete(q, session);
    if (!suggestions.length) return null;
    const place = await api.geo.place(suggestions[0].placeId, session);
    return { lat: place.lat, lng: place.lng };
  } catch {
    return null;
  }
}
