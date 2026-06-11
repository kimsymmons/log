import { describe, it, expect } from 'vitest'
import { estimateCost } from '../cost'

describe('estimateCost', () => {
  it('returns a positive number for claude-sonnet-4-6', () => {
    expect(estimateCost('claude-sonnet-4-6', 1000, 500)).toBeGreaterThan(0)
  })

  it('cost doubles when tokens double', () => {
    const base = estimateCost('claude-sonnet-4-6', 1000, 500)
    const doubled = estimateCost('claude-sonnet-4-6', 2000, 1000)
    expect(doubled).toBeCloseTo(base * 2, 6)
  })

  it('returns 0 for unknown model', () => {
    expect(estimateCost('unknown-model-xyz', 1000, 500)).toBe(0)
  })
})
