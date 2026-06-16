// Dot-grid spacing that cycles through discrete levels as you zoom, the way
// Figma/FigJam do — instead of scaling the grid linearly with zoom (which makes
// dots crowd into a smear when zoomed out and balloon impossibly far apart when
// zoomed in), we snap the canvas-coord spacing to a power-of-two multiple of the
// base unit so the *apparent* (on-screen) gap always lands in a comfortable band.

// Base dot spacing in page units (mirrors --canvas-dot-gap).
export const BASE_DOT_GAP = 24

// Comfortable apparent gap range, in screen px. The grid spacing is chosen so
// that `spacing * zoom` (the on-screen distance between dots) stays within
// [MIN_APPARENT, 2 * MIN_APPARENT). At MIN_APPARENT = 20 that's ~20–40px.
export const MIN_APPARENT = 20

// Pick the canvas-coord dot spacing for a given zoom. Doubles the base when
// zoomed out (so dots don't crowd) and halves it when zoomed in (so dots don't
// drift apart), cycling through 24/2ⁿ levels. Pure + total for any zoom > 0.
export function gridSpacing(zoom: number): number {
  if (!(zoom > 0) || !Number.isFinite(zoom)) return BASE_DOT_GAP
  let spacing = BASE_DOT_GAP
  // Zoomed in: apparent gap too large → shrink the canvas spacing.
  while (spacing * zoom >= MIN_APPARENT * 2) spacing /= 2
  // Zoomed out: apparent gap too small → grow the canvas spacing.
  while (spacing * zoom < MIN_APPARENT) spacing *= 2
  return spacing
}

// On-screen distance between dots (px) for a given zoom — what backgroundSize
// consumes. Always within [MIN_APPARENT, 2 * MIN_APPARENT).
export function apparentGap(zoom: number): number {
  return gridSpacing(zoom) * zoom
}
