import { env } from '../env';
import { DEFAULT_WHATSAPP_TEMPLATE, renderTemplate } from './settings';

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

/** The arrival message, from the admin-editable template (see Administration > Messages). */
export function buildArrivalMessage(input: ArrivalMessageInput, template: string = DEFAULT_WHATSAPP_TEMPLATE): string {
  return renderTemplate(template, {
    patientName: input.patientName,
    vehicleMake: input.vehicleMake,
    vehicleModel: input.vehicleModel,
    vehicleColor: input.vehicleColor,
    vehiclePlate: input.vehiclePlate,
    driverName: input.driverName,
    driverPhone: input.driverPhone,
  });
}

export function buildWhatsAppLink(phone: string, message: string, countryCode?: string): string {
  const normalized = normalizePhone(phone, countryCode);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
