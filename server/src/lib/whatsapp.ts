import { DEFAULT_WHATSAPP_TEMPLATE, renderTemplate } from './settings';

/**
 * WhatsApp is intentionally NOT integrated via an API.
 * We only prepare the message text and a wa.me deep link so the coordinator
 * can click "send" inside WhatsApp (Web or mobile) themselves.
 */

/**
 * The patient's number exactly as entered, as digits only (a leading 00 is dropped).
 * No country code is ever added: the number must be typed with its international prefix.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

/** An international number: 8-15 digits that do not start with 0 (country codes never do). */
export function isValidInternationalPhone(raw: string): boolean {
  return /^[1-9]\d{7,14}$/.test(normalizePhone(raw));
}

/** The form a number is stored in: "+" and the digits. */
export function canonicalPhone(raw: string): string {
  return `+${normalizePhone(raw)}`;
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

/** A wa.me link, or null when the stored number is not a complete international number. */
export function buildWhatsAppLink(phone: string, message: string): string | null {
  if (!isValidInternationalPhone(phone)) return null;
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
