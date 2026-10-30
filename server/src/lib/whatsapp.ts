import { env } from '../env';

/**
 * WhatsApp is intentionally NOT integrated via an API.
 * We only prepare the message text and a wa.me deep link so the coordinator
 * can click "send" inside WhatsApp (Web or mobile) themselves.
 */

export function normalizePhone(raw: string, countryCode = env.defaultCountryCode): string {
  const digits = (raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(countryCode)) return digits;
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  return countryCode + digits;
}

export interface ArrivalMessageInput {
  patientName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor?: string | null;
  driverName: string;
  driverPhone?: string | null;
}

export function buildArrivalMessage(input: ArrivalMessageInput): string {
  const vehicle = `${input.vehicleMake} ${input.vehicleModel}`.trim();
  const color = input.vehicleColor ? ` (${input.vehicleColor})` : '';
  return [
    `مرحباً ${input.patientName}،`,
    '',
    `سيارة العيادة وصلت الآن إلى موقعك.`,
    `السيارة: ${vehicle}${color}`,
    `رقم اللوحة: ${input.vehiclePlate}`,
    `السائق: ${input.driverName}${input.driverPhone ? ` - ${input.driverPhone}` : ''}`,
    '',
    'يرجى التوجه إلى السيارة. شكراً لك.',
  ].join('\n');
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
