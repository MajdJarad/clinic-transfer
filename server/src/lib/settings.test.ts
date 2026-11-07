import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  renderTemplate,
  settingsPatchSchema,
  settingsSchema,
  unknownVariables,
} from './settings';
import { buildArrivalMessage, buildWhatsAppLink, canonicalPhone, isValidInternationalPhone, normalizePhone } from './whatsapp';

describe('renderTemplate', () => {
  it('fills every occurrence of a variable', () => {
    expect(renderTemplate('{patientName} / {patientName}', { patientName: 'سارة' })).toBe('سارة / سارة');
  });
  it('leaves no "()" or dangling " - " when optional values are missing', () => {
    const out = renderTemplate('السيارة: {vehicleMake} ({vehicleColor})\nالسائق: {driverName} - {driverPhone}', {
      vehicleMake: 'تويوتا',
      driverName: 'محمد',
    });
    expect(out).toBe('السيارة: تويوتا\nالسائق: محمد');
  });
  it('keeps unknown placeholders visible instead of silently dropping them', () => {
    expect(renderTemplate('مرحباً {nope}', {})).toBe('مرحباً {nope}');
  });
});

describe('unknownVariables', () => {
  it('lists unknown placeholders once', () => {
    expect(unknownVariables('{patientName} {foo} {foo} {bar}')).toEqual(['foo', 'bar']);
  });
  it('accepts the default template', () => {
    expect(unknownVariables(DEFAULT_WHATSAPP_TEMPLATE)).toEqual([]);
  });
});

describe('buildArrivalMessage', () => {
  const input = {
    patientName: 'سارة',
    vehicleMake: 'تويوتا',
    vehicleModel: 'كورولا',
    vehiclePlate: '34 ABC 123',
    vehicleColor: 'أبيض',
    driverName: 'محمد',
    driverPhone: '0500000000',
  };
  it('uses the default template', () => {
    const t = buildArrivalMessage(input);
    expect(t).toContain('مرحباً سارة،');
    expect(t).toContain('السيارة: تويوتا كورولا (أبيض)');
    expect(t).toContain('السائق: محمد - 0500000000');
  });
  it('uses a custom template from the admin', () => {
    expect(buildArrivalMessage(input, 'السائق {driverName} وصل بسيارة {vehiclePlate}')).toBe('السائق محمد وصل بسيارة 34 ABC 123');
  });
});

describe('patient phone numbers (never auto-prefixed)', () => {
  it('keeps exactly the digits that were typed', () => {
    expect(normalizePhone('+90 533 133 85 05')).toBe('905331338505');
    expect(normalizePhone('905331338505')).toBe('905331338505');
    expect(normalizePhone('00905331338505')).toBe('905331338505');
  });
  it('does NOT add a country code (the old bug turned 90... into 96690...)', () => {
    expect(normalizePhone('905331338505')).not.toMatch(/^966/);
    expect(normalizePhone('551112233')).toBe('551112233');
  });
  it('accepts only complete international numbers', () => {
    expect(isValidInternationalPhone('+905331338505')).toBe(true);
    expect(isValidInternationalPhone('966551112233')).toBe(true);
    expect(isValidInternationalPhone('0551112233')).toBe(false); // local format: no country code
    expect(isValidInternationalPhone('12345')).toBe(false);
    expect(isValidInternationalPhone('')).toBe(false);
  });
  it('stores numbers in one canonical form', () => {
    expect(canonicalPhone('00 90 533 133 85 05')).toBe('+905331338505');
  });
  it('builds a wa.me link from exactly the stored digits, or none for an incomplete number', () => {
    expect(buildWhatsAppLink('+905331338505', 'hi')).toBe('https://wa.me/905331338505?text=hi');
    expect(buildWhatsAppLink('0551112233', 'hi')).toBeNull();
  });
});

describe('settings validation', () => {
  const ok = {
    clinicName: 'عيادة',
    whatsappTemplate: 'مرحباً {patientName}، وصلت السيارة',
    mapCenterLat: 41.0082,
    mapCenterLng: 28.9784,
    mapZoom: 11,
  };
  it('accepts valid settings', () => {
    expect(settingsSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects out-of-range or malformed values', () => {
    expect(settingsSchema.safeParse({ ...ok, mapCenterLat: 120 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, mapZoom: 99 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, clinicName: '  ' }).success).toBe(false);
  });
  it('a patch is partial but strict (unknown keys are refused)', () => {
    expect(settingsPatchSchema.safeParse({ mapZoom: 12 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ googleMapsApiKey: 'x' }).success).toBe(false);
  });
});
