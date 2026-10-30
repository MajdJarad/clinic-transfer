// Google-Calendar-like event palette. Each driver is assigned a colour.
export const DRIVER_PALETTE = [
  '#7986cb',
  '#33b679',
  '#8e24aa',
  '#e67c73',
  '#f6bf26',
  '#f4511e',
  '#039be5',
  '#616161',
  '#3f51b5',
  '#0b8043',
];

export const UNASSIGNED_COLOR = '#9e9e9e';

export function buildColorMap(driverIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  driverIds.forEach((id, i) => {
    map[id] = DRIVER_PALETTE[i % DRIVER_PALETTE.length];
  });
  return map;
}
