/**
 * Pure helpers behind the thread-card / design-replay work.
 * (Filter wiring is covered by FilterContext.test.tsx + design-system.test.tsx.)
 */
import { describe, it, expect } from 'vitest'
import { tagColor } from '../tagColor'
import { nameToGlyph } from '../tagStore'
import { rectEdgePoint } from '../TagConnectionOverlay'
import { cardMetaLabel } from '../../shapes/ChatCard'

describe('tagColor', () => {
  it('is deterministic for a given label', () => {
    expect(tagColor('design')).toBe(tagColor('design'))
  })

  it('only ever returns sticky-palette names', () => {
    const palette = ['yellow', 'green', 'blue', 'purple', 'pink', 'gray']
    for (const t of ['design', 'api', 'infra', 'research', 'ux', 'a', '', 'zzzz']) {
      expect(palette).toContain(tagColor(t))
    }
  })
})

describe('nameToGlyph', () => {
  it('derives a meaning-bearing glyph from common tag words (never "tag")', () => {
    expect(nameToGlyph('design')).toBe('pen-line')
    expect(nameToGlyph('Research')).toBe('search')
    expect(nameToGlyph('idea')).toBe('lightbulb')
    expect(nameToGlyph('api')).toBe('server')
  })

  it('falls back to "hash" for unknown labels — and never to "tag"', () => {
    for (const t of ['zzz', 'q3', 'misc', '']) {
      const g = nameToGlyph(t)
      expect(g).not.toBe('tag')
    }
    expect(nameToGlyph('zzz')).toBe('hash')
  })
})

describe('rectEdgePoint', () => {
  it('lands on the right edge for a horizontal ray', () => {
    expect(rectEdgePoint(0, 0, 10, 5, 100, 0)).toEqual({ x: 10, y: 0 })
  })

  it('lands on the top edge for a vertical ray', () => {
    expect(rectEdgePoint(0, 0, 10, 5, 0, 100)).toEqual({ x: 0, y: 5 })
  })

  it('clips a diagonal ray to the nearer (top) edge', () => {
    expect(rectEdgePoint(0, 0, 10, 5, 100, 100)).toEqual({ x: 5, y: 5 })
  })

  it('returns the centre when target coincides with it', () => {
    expect(rectEdgePoint(7, 3, 10, 5, 7, 3)).toEqual({ x: 7, y: 3 })
  })
})

describe('cardMetaLabel', () => {
  it('counts replies for threads', () => {
    expect(cardMetaLabel('thread', 0, '')).toBe('0 replies')
    expect(cardMetaLabel('thread', 1, '')).toBe('1 reply')
    expect(cardMetaLabel('thread', 3, '')).toBe('3 replies')
  })

  it('counts words for docs', () => {
    expect(cardMetaLabel('doc', 0, 'two words here')).toBe('3 words')
    expect(cardMetaLabel('doc', 0, '')).toBe('0 words')
  })

  it('labels other types by name', () => {
    expect(cardMetaLabel('project', 0, '')).toBe('Project')
    expect(cardMetaLabel('idea', 0, '')).toBe('Idea')
    expect(cardMetaLabel('sketch', 0, '')).toBe('Sketch')
  })
})
