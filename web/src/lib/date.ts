export const DEFAULT_INTL = 'ar-EG';

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -startOfDay(d).getDay());
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export function endOfMonth(d: Date): Date {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() + 1);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function dateAtMinutes(day: Date, minutes: number): Date {
  const x = startOfDay(day);
  x.setMinutes(minutes);
  return x;
}

export function formatTime(d: Date, intl = DEFAULT_INTL): string {
  return d.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
}

export function formatMonthYear(d: Date, intl = DEFAULT_INTL): string {
  return d.toLocaleDateString(intl, { month: 'long', year: 'numeric' });
}

export function formatDayFull(d: Date, intl = DEFAULT_INTL): string {
  return d.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatRangeLabel(a: Date, b: Date, intl = DEFAULT_INTL): string {
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.getDate()} - ${b.getDate()} ${a.toLocaleDateString(intl, { month: 'long', year: 'numeric' })}`;
  }
  return `${a.toLocaleDateString(intl, { day: 'numeric', month: 'long' })} - ${b.toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

export function formatDateTime(value: string, intl = DEFAULT_INTL): string {
  const d = new Date(value);
  return d.toLocaleString(intl, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
