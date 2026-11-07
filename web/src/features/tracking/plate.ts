/**
 * The letters of a number plate, e.g. "34 MPV 786" -> "MPV": all a car needs on the map to be told apart
 * from the others. Falls back to the driver's initials when the plate has no letters.
 */
export function plateLetters(plate: string | null | undefined, driverName = ''): string {
  const m = /[A-Za-zÇĞİÖŞÜçğıöşüء-ي]+/.exec(plate ?? '');
  if (m) return m[0].toLocaleUpperCase('en').slice(0, 4);
  const initials = driverName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3);
  return initials || '—';
}
