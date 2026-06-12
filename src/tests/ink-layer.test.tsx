/**
 * Tests for pure utility functions exported from InkLayer.tsx.
 *
 * NOTE: InkLayer component integration tests (pointer events, RAF
 * scheduling, canvas rendering, API calls) are pending. The component
 * requires a real tldraw Editor instance and a canvas context that are
 * non-trivial to construct in jsdom.
 */
import { describe, it, expect } from 'vitest'
import { pointNearStroke, applyCamera } from '../ink/InkLayer'
import type { Stroke } from '../ink/InkLayer'

const makeStroke = (points: Array<{ x: number; y: number; pressure: number }>): Stroke => ({
  id: 'test',
  points,
  color: '#1a1a1a',
  width: 3,
  canvasX: points[0]?.x ?? 0,
  canvasY: points[0]?.y ?? 0,
  zoom: 1,
})

describe('pointNearStroke', () => {
  it('returns true when pointer is exactly on a stroke point', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(100, 100, stroke)).toBe(true)
  })

  it('returns true within the 20px default threshold', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(115, 110, stroke)).toBe(true) // ~18px away
  })

  it('returns false beyond the 20px default threshold', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(125, 120, stroke)).toBe(false) // ~27px away
  })

  it('returns true when near any point in a multi-point stroke', () => {
    const stroke = makeStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 100, pressure: 0.5 },
      { x: 200, y: 200, pressure: 0.5 },
    ])
    expect(pointNearStroke(195, 195, stroke)).toBe(true)
  })

  it('returns false when pointer is not near any stroke point', () => {
    const stroke = makeStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 100, pressure: 0.5 },
    ])
    expect(pointNearStroke(50, 0, stroke)).toBe(false)
  })

  it('respects a custom threshold — inclusive at boundary', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(130, 100, stroke, 30)).toBe(true)  // exactly 30px
    expect(pointNearStroke(131, 100, stroke, 30)).toBe(false) // 31px
  })
})

describe('applyCamera', () => {
  it('identity camera leaves coords unchanged', () => {
    expect(applyCamera({ x: 50, y: 80 }, { x: 0, y: 0, z: 1 })).toEqual({ x: 50, y: 80 })
  })

  it('applies pan offset', () => {
    expect(applyCamera({ x: 100, y: 200 }, { x: 10, y: -20, z: 1 })).toEqual({ x: 110, y: 180 })
  })

  it('applies zoom scaling', () => {
    expect(applyCamera({ x: 100, y: 50 }, { x: 0, y: 0, z: 2 })).toEqual({ x: 200, y: 100 })
  })

  it('applies pan and zoom together', () => {
    // x: 10*2 + 5 = 25, y: 20*2 + (-10) = 30
    expect(applyCamera({ x: 10, y: 20 }, { x: 5, y: -10, z: 2 })).toEqual({ x: 25, y: 30 })
  })

  it('handles zoom-out (z < 1)', () => {
    expect(applyCamera({ x: 200, y: 100 }, { x: 0, y: 0, z: 0.5 })).toEqual({ x: 100, y: 50 })
  })
})
