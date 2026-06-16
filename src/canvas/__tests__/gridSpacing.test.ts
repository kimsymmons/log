import { describe, it, expect } from 'vitest'
import { gridSpacing, apparentGap, BASE_DOT_GAP, MIN_APPARENT } from '../gridSpacing'

describe('gridSpacing', () => {
  it('returns the base spacing at 1x zoom', () => {
    expect(gridSpacing(1)).toBe(BASE_DOT_GAP)
  })

  it('keeps the apparent gap within the comfortable band across the zoom range', () => {
    // The whole point: dots never crowd together or drift impossibly far apart.
    for (const zoom of [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 16]) {
      const apparent = apparentGap(zoom)
      expect(apparent).toBeGreaterThanOrEqual(MIN_APPARENT)
      expect(apparent).toBeLessThan(MIN_APPARENT * 2)
    }
  })

  it('doubles the canvas spacing when zoomed out so dots do not crowd', () => {
    // At 0.5x a linear grid would show dots 12px apart (too dense); we instead
    // double the spacing to 48 canvas units → 24px apparent.
    expect(gridSpacing(0.5)).toBe(48)
    expect(apparentGap(0.5)).toBe(24)
  })

  it('halves the canvas spacing when zoomed in so dots do not drift apart', () => {
    // At 2x a linear grid would show dots 48px apart; we halve to 12 canvas
    // units → 24px apparent.
    expect(gridSpacing(2)).toBe(12)
    expect(apparentGap(2)).toBe(24)
  })

  it('snaps to power-of-two multiples of the base unit (so dots stay aligned to origin)', () => {
    for (const zoom of [0.1, 0.3, 1, 3, 10]) {
      const ratio = gridSpacing(zoom) / BASE_DOT_GAP
      const log2 = Math.log2(ratio)
      expect(log2).toBeCloseTo(Math.round(log2), 10)
    }
  })

  it('handles degenerate zoom values without looping forever', () => {
    expect(gridSpacing(0)).toBe(BASE_DOT_GAP)
    expect(gridSpacing(-1)).toBe(BASE_DOT_GAP)
    expect(gridSpacing(NaN)).toBe(BASE_DOT_GAP)
    expect(gridSpacing(Infinity)).toBe(BASE_DOT_GAP)
  })
})
