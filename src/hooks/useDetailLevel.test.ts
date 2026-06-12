import { describe, it, expect } from 'vitest'
import { getDetailLevel, detailDisplay } from './useDetailLevel'

describe('getDetailLevel', () => {
  it('is minimal below 0.6', () => {
    expect(getDetailLevel(0.5)).toBe('minimal')
  })

  // Boundary values (PEO-143 acceptance criteria)
  it('59% zoom → minimal', () => {
    expect(getDetailLevel(0.59)).toBe('minimal')
  })

  it('60% zoom → compact', () => {
    expect(getDetailLevel(0.6)).toBe('compact')
  })

  it('84% zoom → compact', () => {
    expect(getDetailLevel(0.84)).toBe('compact')
  })

  it('85% zoom → full', () => {
    expect(getDetailLevel(0.85)).toBe('full')
  })

  it('is full above 0.85', () => {
    expect(getDetailLevel(1)).toBe('full')
    expect(getDetailLevel(2)).toBe('full')
  })
})

describe('detailDisplay', () => {
  it('full shows everything', () => {
    expect(detailDisplay('full')).toEqual({ body: undefined, secondary: undefined, minimal: false })
  })

  it('compact hides body but keeps secondary chrome', () => {
    expect(detailDisplay('compact')).toEqual({ body: 'none', secondary: undefined, minimal: false })
  })

  it('minimal hides body and secondary, flags collapse', () => {
    expect(detailDisplay('minimal')).toEqual({ body: 'none', secondary: 'none', minimal: true })
  })
})
