import { describe, it, expect } from 'vitest'
import { extractTags, firstTwoSentences } from '../autoTag'

describe('firstTwoSentences', () => {
  it('returns the first two sentences', () => {
    expect(firstTwoSentences('One. Two. Three.')).toBe('One. Two.')
    expect(firstTwoSentences('A! B? C.')).toBe('A! B?')
  })

  it('returns the whole text when there is no sentence break', () => {
    expect(firstTwoSentences('hello world no punctuation')).toBe('hello world no punctuation')
  })

  it('collapses whitespace and handles empty input', () => {
    expect(firstTwoSentences('  spaced   out.  next.  ')).toBe('spaced out. next.')
    expect(firstTwoSentences('')).toBe('')
  })
})

describe('extractTags', () => {
  it('is deterministic and returns at most 4 kebab-case tags', () => {
    const text = 'Backlinks debate: should we ship backlinks and tags together?'
    const a = extractTags(text)
    const b = extractTags(text)
    expect(a).toEqual(b)
    expect(a.length).toBeLessThanOrEqual(4)
    // every tag is lowercase / kebab-safe
    for (const t of a) expect(t).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })

  it('ranks the most frequent content word first', () => {
    expect(extractTags('backlinks backlinks backlinks api', 4)[0]).toBe('backlinks')
  })

  it('drops stop words and short tokens', () => {
    const tags = extractTags('the and for to a an it of error budget tracking')
    expect(tags).not.toContain('the')
    expect(tags).not.toContain('and')
    expect(tags).toContain('error')
    expect(tags).toContain('budget')
  })

  it('respects the max count', () => {
    expect(extractTags('alpha beta gamma delta epsilon zeta', 4).length).toBe(4)
  })

  it('returns nothing for content-free text', () => {
    expect(extractTags('the and for to of a an it')).toEqual([])
  })
})
