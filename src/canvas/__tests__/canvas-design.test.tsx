/**
 * Pure helpers behind the thread-card / design-replay work.
 * (Filter wiring is covered by FilterContext.test.tsx + design-system.test.tsx.)
 */
import { describe, it, expect } from 'vitest'
import { tagColor } from '../tagColor'
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
