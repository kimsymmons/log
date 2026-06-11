import { describe, it, expect } from 'vitest'
import { computeVisibleShapes, getLOD, type Artifact, type Viewport } from '../perf'

const rect = (id: string, x: number, y: number, w: number, h: number): Artifact => ({
  id,
  canvas_x: x,
  canvas_y: y,
  canvas_w: w,
  canvas_h: h,
})

describe('computeVisibleShapes', () => {
  const viewport: Viewport = { x: 0, y: 0, width: 1280, height: 800 }

  it('returns shapes that fully overlap the viewport', () => {
    const shape = rect('a', 100, 100, 240, 120)
    expect(computeVisibleShapes([shape], viewport)).toEqual([shape])
  })

  it('excludes shapes entirely to the right of the viewport', () => {
    const shape = rect('b', 1300, 100, 240, 120)
    expect(computeVisibleShapes([shape], viewport)).toEqual([])
  })

  it('excludes shapes entirely to the left of the viewport', () => {
    const shape = rect('c', -300, 100, 240, 120)
    expect(computeVisibleShapes([shape], viewport)).toEqual([])
  })

  it('excludes shapes entirely below the viewport', () => {
    const shape = rect('d', 100, 900, 240, 120)
    expect(computeVisibleShapes([shape], viewport)).toEqual([])
  })

  it('excludes shapes entirely above the viewport', () => {
    const shape = rect('e', 100, -200, 240, 120)
    expect(computeVisibleShapes([shape], viewport)).toEqual([])
  })

  it('includes shapes that partially overlap the viewport edge', () => {
    const shape = rect('f', 1200, 100, 240, 120)
    expect(computeVisibleShapes([shape], viewport)).toEqual([shape])
  })

  it('filters a mixed list correctly', () => {
    const visible = rect('g', 50, 50, 100, 100)
    const offscreen = rect('h', 5000, 5000, 100, 100)
    const result = computeVisibleShapes([visible, offscreen], viewport)
    expect(result).toEqual([visible])
  })

  it('returns empty array for empty input', () => {
    expect(computeVisibleShapes([], viewport)).toEqual([])
  })
})

describe('getLOD', () => {
  it('returns full at zoom = 1', () => {
    expect(getLOD(1)).toBe('full')
  })

  it('returns full at zoom = 0.5', () => {
    expect(getLOD(0.5)).toBe('full')
  })

  it('returns minimal at zoom = 0.49', () => {
    expect(getLOD(0.49)).toBe('minimal')
  })

  it('returns minimal at zoom = 0.1', () => {
    expect(getLOD(0.1)).toBe('minimal')
  })

  it('returns full at zoom = 2', () => {
    expect(getLOD(2)).toBe('full')
  })
})
