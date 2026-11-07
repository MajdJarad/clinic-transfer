import { describe, expect, it } from 'vitest';
import { ageLabel, freshnessOf } from './freshness';

describe('freshness of a driver position', () => {
  it('is live for a few seconds, then recent, then stale', () => {
    expect(freshnessOf(2)).toBe('live');
    expect(freshnessOf(30)).toBe('live');
    expect(freshnessOf(31)).toBe('recent');
    expect(freshnessOf(300)).toBe('recent');
    expect(freshnessOf(301)).toBe('stale');
  });
  it('has nothing for a driver who never reported', () => {
    expect(freshnessOf(null)).toBe('none');
    expect(ageLabel(null)).toBe('لا يوجد موقع');
  });
  it('words the age for people', () => {
    expect(ageLabel(2)).toBe('الآن');
    expect(ageLabel(12)).toBe('قبل 12 ث');
    expect(ageLabel(180)).toBe('قبل 3 د');
    expect(ageLabel(7200)).toBe('قبل 2 س');
  });
});
