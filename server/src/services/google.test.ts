import { describe, expect, it } from 'vitest';
import { cleanText, decodePolyline } from './google';

describe('decodePolyline', () => {
  it('decodes the reference example from the Google docs (as [lng, lat])', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0][1]).toBeCloseTo(38.5, 5);
    expect(pts[0][0]).toBeCloseTo(-120.2, 5);
    expect(pts[1][1]).toBeCloseTo(40.7, 5);
    expect(pts[1][0]).toBeCloseTo(-120.95, 5);
    expect(pts[2][1]).toBeCloseTo(43.252, 5);
    expect(pts[2][0]).toBeCloseTo(-126.453, 5);
  });
  it('returns nothing for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('cleanText', () => {
  it('strips invisible bidi marks Google wraps around names', () => {
    expect(cleanText('‪İstanbul‬‏')).toBe('İstanbul');
  });
  it('joins multi-line instructions so they read and speak as one sentence', () => {
    expect(cleanText('المتابعة في O-7\nطريق برسوم مرور')).toBe('المتابعة في O-7. طريق برسوم مرور');
  });
  it('copes with undefined', () => {
    expect(cleanText(undefined)).toBe('');
  });
});
