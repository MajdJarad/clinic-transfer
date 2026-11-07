import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  renderTemplate,
  settingsPatchSchema,
  settingsSchema,
  unknownVariables,
} from './settings';
import { buildArrivalMessage, normalizePhone, buildWhatsAppLink } from './whatsapp';

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

describe('phone normalization with the configurable country code', () => {
  it('prefixes the code and drops the leading zero', () => {
    expect(normalizePhone('0551112233', '966')).toBe('966551112233');
    expect(normalizePhone('0532 111 22 33', '90')).toBe('905321112233');
  });
  it('keeps a number that already has the code, and handles 00 prefixes', () => {
    expect(normalizePhone('966551112233', '966')).toBe('966551112233');
    expect(normalizePhone('00905321112233', '90')).toBe('905321112233');
  });
  it('builds a wa.me link with the chosen code', () => {
    expect(buildWhatsAppLink('0532 111 22 33', 'hi', '90')).toBe('https://wa.me/905321112233?text=hi');
  });
});

describe('settings validation', () => {
  const ok = {
    clinicName: 'عيادة',
    defaultCountryCode: '90',
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
    expect(settingsSchema.safeParse({ ...ok, defaultCountryCode: '+966' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, mapZoom: 99 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...ok, clinicName: '  ' }).success).toBe(false);
  });
  it('a patch is partial but strict (unknown keys are refused)', () => {
    expect(settingsPatchSchema.safeParse({ mapZoom: 12 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ googleMapsApiKey: 'x' }).success).toBe(false);
  });
});
