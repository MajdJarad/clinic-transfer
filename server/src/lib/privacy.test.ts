import { describe, expect, it } from 'vitest';
import { redactPatientPhone } from './privacy';

describe('redactPatientPhone', () => {
  it('blanks the patient phone, wherever it is nested', () => {
    const trip = { id: 't1', patientName: 'سارة', patientPhone: '+905331234567', driver: { user: { phone: '0500' } }, items: [{ patientPhone: '+1' }] };
    const out = redactPatientPhone(trip) as typeof trip;
    expect(out.patientPhone).toBe('');
    expect(out.items[0].patientPhone).toBe('');
    expect(JSON.stringify(out)).not.toContain('905331234567');
  });
  it('works on lists and leaves everything else (names, the DRIVER\'s own phone, dates) alone', () => {
    const when = new Date('2026-01-01T10:00:00Z');
    const out = redactPatientPhone([{ patientName: 'نورة', patientPhone: '+9', driver: { user: { phone: '0500' } }, scheduledAt: when }]) as any[];
    expect(out[0].patientName).toBe('نورة');
    expect(out[0].driver.user.phone).toBe('0500');
    expect(out[0].scheduledAt).toBeInstanceOf(Date);
    expect(out[0].patientPhone).toBe('');
  });
  it('does not mutate its input', () => {
    const trip = { patientPhone: '+905331234567' };
    redactPatientPhone(trip);
    expect(trip.patientPhone).toBe('+905331234567');
  });
  it('passes primitives and null through', () => {
    expect(redactPatientPhone(null)).toBeNull();
    expect(redactPatientPhone('x')).toBe('x');
  });
});
