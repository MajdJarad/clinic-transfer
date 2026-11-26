/**
 * One set of sizes for everything that floats over a map (admin map, live tracking, navigation), so the
 * search bars, side panels and round buttons line up from screen to screen:
 *   round buttons 40/44 px, search pill 48 px, side panels 384 px wide, 16 px from the edges.
 */
export const MAP_BTN =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-float transition hover:bg-surface2 active:scale-95 sm:h-11 sm:w-11';
/** A map button that is switched on. */
export const MAP_BTN_ON = '!bg-brand-600 !text-white hover:!bg-brand-700';
/** Frosted white panel: search bar, directions, driver list, place card. */
export const MAP_PANEL = 'rounded-3xl bg-surface/95 text-fg shadow-float backdrop-blur-xl';
/** Width of the side column (search / directions / driver list) on wide screens. */
export const MAP_COL = 'sm:w-96';
/** Small pill chip over a map. */
export const MAP_CHIP = 'inline-flex h-9 items-center gap-1.5 rounded-full bg-surface/95 px-3.5 text-xs font-medium text-fg shadow-float backdrop-blur-xl';
