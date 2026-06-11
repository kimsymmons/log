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

// ── pointNearStroke ──────────────────────────────────────────────────────────

describe('pointNearStroke', () => {
  it('returns true when pointer is exactly on a stroke point', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(100, 100, stroke)).toBe(true)
  })

  it('returns true within 20px threshold', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(115, 110, stroke)).toBe(true) // ~18px away
  })

  it('returns false when pointer is beyond 20px', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(125, 120, stroke)).toBe(false) // ~27px away
  })

  it('returns true when near any point in stroke', () => {
    const stroke = makeStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 100, pressure: 0.5 },
      { x: 200, y: 200, pressure: 0.5 },
    ])
    expect(pointNearStroke(195, 195, stroke)).toBe(true)
  })

  it('returns false when pointer is near none of the points', () => {
    const stroke = makeStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 100, pressure: 0.5 },
    ])
    expect(pointNearStroke(50, 0, stroke)).toBe(false) // ~50px from both
  })

  it('respects a custom threshold', () => {
    const stroke = makeStroke([{ x: 100, y: 100, pressure: 0.5 }])
    expect(pointNearStroke(130, 100, stroke, 30)).toBe(true)  // 30px, threshold=30
    expect(pointNearStroke(131, 100, stroke, 30)).toBe(false) // 31px, threshold=30
  })
})

// ── applyCamera ──────────────────────────────────────────────────────────────

describe('applyCamera', () => {
  it('identity camera leaves coords unchanged', () => {
    const result = applyCamera({ x: 50, y: 80 }, { x: 0, y: 0, z: 1 })
    expect(result).toEqual({ x: 50, y: 80 })
  })

  it('applies pan offset', () => {
    const result = applyCamera({ x: 100, y: 200 }, { x: 10, y: -20, z: 1 })
    expect(result).toEqual({ x: 110, y: 180 })
  })

  it('applies zoom scaling', () => {
    const result = applyCamera({ x: 100, y: 50 }, { x: 0, y: 0, z: 2 })
    expect(result).toEqual({ x: 200, y: 100 })
  })

  it('applies pan and zoom together', () => {
    const result = applyCamera({ x: 10, y: 20 }, { x: 5, y: -10, z: 2 })
    // x: 10*2 + 5 = 25, y: 20*2 + (-10) = 30
    expect(result).toEqual({ x: 25, y: 30 })
  })

  it('handles zoom-out (z < 1)', () => {
    const result = applyCamera({ x: 200, y: 100 }, { x: 0, y: 0, z: 0.5 })
    expect(result).toEqual({ x: 100, y: 50 })
  })
})
