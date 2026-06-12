import { describe, it, expect } from 'vitest'
import {
  sharedTags,
  computeConnections,
  isHighlighted,
  tagColor,
  TAG_PALETTE,
  type TaggedNode,
} from './ConnectionLines'

const node = (id: string, tags: string[]): TaggedNode => ({ id, tags })

describe('sharedTags', () => {
  it('returns the intersection in the first arg order', () => {
    expect(sharedTags(node('a', ['x', 'y', 'z']), node('b', ['z', 'x']))).toEqual(['x', 'z'])
  })

  it('returns empty when no overlap', () => {
    expect(sharedTags(node('a', ['x']), node('b', ['y']))).toEqual([])
  })
})

describe('computeConnections', () => {
  it('draws no lines when no two shapes share a tag', () => {
    const nodes = [node('a', ['red']), node('b', ['blue']), node('c', ['green'])]
    expect(computeConnections(nodes)).toEqual([])
  })

  it('draws a line when two shapes share a tag', () => {
    const conns = computeConnections([node('a', ['red']), node('b', ['red'])])
    expect(conns).toHaveLength(1)
    expect(conns[0].aId).toBe('a')
    expect(conns[0].bId).toBe('b')
    expect(conns[0].sharedTags).toEqual(['red'])
  })

  it('ignores shapes with no tags', () => {
    const conns = computeConnections([node('a', ['red']), node('b', []), node('c', ['red'])])
    // only a–c connect; b has no tags
    expect(conns).toHaveLength(1)
    expect(conns[0].aId).toBe('a')
    expect(conns[0].bId).toBe('c')
  })

  it('connects every pair that shares a tag (no duplicates)', () => {
    const conns = computeConnections([
      node('a', ['red']),
      node('b', ['red']),
      node('c', ['red']),
    ])
    expect(conns.map((c) => c.key)).toEqual(['a__b', 'a__c', 'b__c'])
  })

  it('uses the first shared tag to pick the highlight colour', () => {
    const conns = computeConnections([node('a', ['alpha', 'beta']), node('b', ['beta', 'alpha'])])
    expect(conns[0].color).toBe(tagColor('alpha'))
  })
})

describe('isHighlighted', () => {
  const [conn] = computeConnections([node('a', ['red']), node('b', ['red'])])

  it('is false when neither endpoint is in the highlighted set', () => {
    expect(isHighlighted(conn, new Set())).toBe(false)
    expect(isHighlighted(conn, new Set(['other']))).toBe(false)
  })

  it('is true when the a endpoint is highlighted', () => {
    expect(isHighlighted(conn, new Set(['a']))).toBe(true)
  })

  it('is true when the b endpoint is highlighted', () => {
    expect(isHighlighted(conn, new Set(['b']))).toBe(true)
  })
})

describe('tagColor', () => {
  it('is deterministic for the same tag', () => {
    expect(tagColor('design')).toBe(tagColor('design'))
  })

  it('only ever returns a palette colour', () => {
    for (const t of ['a', 'design', 'research', 'foo-bar', 'longer tag name', '']) {
      expect(TAG_PALETTE).toContain(tagColor(t))
    }
  })
})
