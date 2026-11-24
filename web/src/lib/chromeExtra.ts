import { useLayoutEffect, type RefObject } from 'react';

/**
 * Full-height screens (maps, live tracking) size themselves as "the window minus the page chrome". Banners
 * that appear above them (driver alerts, the temporary-database notice) take space too, so each one reports
 * its height here and the screens subtract the sum (CSS variable --chrome-extra): the map keeps fitting the
 * window instead of spilling below it.
 */
const heights = new Map<string, number>();

function apply() {
  let sum = 0;
  heights.forEach((h) => (sum += h));
  document.documentElement.style.setProperty('--chrome-extra', `${sum}px`);
}

export function useChromeHeight(key: string, ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) {
      heights.delete(key);
      apply();
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      heights.set(key, Math.round(r.height + parseFloat(cs.marginTop || '0') + parseFloat(cs.marginBottom || '0')));
      apply();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      heights.delete(key);
      apply();
    };
  }, [key, ref, active]);
}
