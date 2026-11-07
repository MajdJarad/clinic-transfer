import { describe, expect, it } from 'vitest';
import { plateLetters } from './plate';

describe('plateLetters', () => {
  it('keeps only the letters of the plate', () => {
    expect(plateLetters('34 MPV 786')).toBe('MPV');
    expect(plateLetters('34 PVK 464')).toBe('PVK');
    expect(plateLetters('34 vip 606')).toBe('VIP');
    expect(plateLetters('34VIP606')).toBe('VIP');
  });
  it('handles Turkish and Arabic letters', () => {
    expect(plateLetters('34 ÇŞA 100')).toBe('ÇŞA');
    expect(plateLetters('١٢٣ أ ب ج')).toBe('أ');
  });
  it('falls back to the driver\'s initials, then to a dash', () => {
    expect(plateLetters('34 786', 'محمد أحمد')).toBe('مأ');
    expect(plateLetters(null, '')).toBe('—');
  });
});
