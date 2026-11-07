/**
 * Drivers must never learn a patient's phone number. Every trip response that goes to a driver is
 * passed through this, so the number cannot leak through any endpoint, now or later.
 */
export function redactPatientPhone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactPatientPhone) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === 'patientPhone' ? '' : redactPatientPhone(v);
    }
    return out as T;
  }
  return value;
}
