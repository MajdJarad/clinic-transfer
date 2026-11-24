// Calm event palette (muted mid-tones, one per driver). Events are drawn as a soft tint of the colour with a
// coloured edge, so a full day stays easy on the eyes.
export const DRIVER_PALETTE = [
  '#2f8f83',
  '#5b7bb5',
  '#8069b5',
  '#c0735f',
  '#b8903a',
  '#6d9a62',
  '#4f8aa6',
  '#b2607d',
  '#6b7a99',
  '#8a9a4e',
];

export const UNASSIGNED_COLOR = '#98a2b3';

/** A soft tint of `color` over the card surface (works in light and dark). */
export const tint = (color: string, percent = 16) => `color-mix(in srgb, ${color} ${percent}%, var(--surface))`;

export function buildColorMap(driverIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  driverIds.forEach((id, i) => {
    map[id] = DRIVER_PALETTE[i % DRIVER_PALETTE.length];
  });
  return map;
}
