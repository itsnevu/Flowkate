// --- Design system recipes -------------------------------------------------
// Shared class strings so every field in this long pane is extruded from the
// same material. Light always falls from the top-left.

export const LABEL_BASE = 'text-xs font-medium uppercase tracking-wide text-ink-soft';
export const FIELD_LABEL = `mb-1.5 block ${LABEL_BASE}`;
export const FIELD_WELL =
  'w-full rounded-soft bg-canvas-sunk px-3 py-2 text-sm text-ink shadow-neu-inset-sm placeholder:text-ink-faint transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset';
export const SELECT_WELL = `${FIELD_WELL} appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none`;
export const TAG_WELL =
  'flex min-h-[42px] flex-wrap items-center gap-2 rounded-soft bg-canvas-sunk p-2 shadow-neu-inset';
export const TAG_INPUT =
  'min-w-[150px] flex-1 rounded-soft bg-transparent p-1 text-sm text-ink placeholder:text-ink-faint transition-shadow duration-150 ease-press focus:outline-none focus-visible:shadow-neu-inset-sm';
export const KEY_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-soft bg-graphite px-4 py-2 text-sm font-medium text-graphite-50 shadow-key transition-all duration-150 ease-press hover:bg-graphite-hover active:translate-y-px active:bg-graphite-active active:shadow-key-pressed disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:bg-graphite disabled:active:translate-y-0';
export const KEY_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-soft bg-canvas-raised px-4 py-2 text-sm font-medium text-ink shadow-neu-sm transition-all duration-150 ease-press hover:shadow-neu active:shadow-neu-inset-sm disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none';
export const ICON_KEY =
  'grid size-9 shrink-0 place-items-center rounded-soft bg-canvas-raised text-ink-soft shadow-neu-sm transition-all duration-150 ease-press hover:text-ink active:shadow-neu-inset-sm';
export const CHIP =
  'flex items-center gap-1 rounded-pill bg-graphite py-1 pl-3 pr-1 text-xs font-medium text-graphite-50 shadow-key-sm';
export const CHIP_REMOVE =
  'grid size-5 place-items-center rounded-pill text-graphite-200 transition-colors duration-150 ease-press hover:bg-white/10 hover:text-graphite-50';
export const DIVIDER = 'h-px bg-gradient-to-r from-transparent via-black/10 to-transparent';

// Slider track: graphite fill up to the current value, sunken canvas after it.
export const sliderTrack = (fraction: number) => {
  const percent = Math.min(Math.max(fraction, 0), 1) * 100;
  return {
    background: `linear-gradient(to right, #1c1f24 0%, #1c1f24 ${percent}%, #e6e9ee ${percent}%, #e6e9ee 100%)`,
  };
};
