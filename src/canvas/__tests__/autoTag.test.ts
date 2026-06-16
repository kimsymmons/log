import { describe, it, expect } from 'vitest'
import { extractTags, firstTwoSentences, normalizeTag } from '../autoTag'

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

describe('extractTags — format rules', () => {
  it('is deterministic and returns at most 4 single lowercase words', () => {
    const text = 'Backlinks debate: should we ship backlinks and tags together?'
    const a = extractTags(text)
    expect(a).toEqual(extractTags(text))
    expect(a.length).toBeLessThanOrEqual(4)
    for (const t of a) expect(t).toMatch(/^[a-z]+$/) // single lowercase word, no digits/hyphens
  })

  it('ranks the most frequent content word first', () => {
    expect(extractTags('irrigation irrigation irrigation system', 4)[0]).toBe('irrigation')
  })

  it('singularises plurals (no plural tags)', () => {
    expect(extractTags('mortgage rates and interest rates')).toContain('rate')
    expect(extractTags('podcast episodes episodes episodes')[0]).toBe('episode')
    expect(extractTags('climate tipping points')).toContain('point')
  })

  it('leaves non-plural -s words intact (canvas, status, analysis)', () => {
    expect(normalizeTag('Canvas')).toBe('canvas')
    expect(normalizeTag('status')).toBe('status')
    expect(extractTags('spatial canvas canvas canvas app')[0]).toBe('canvas')
  })

  it('strips contractions — no fragments like "i-m" or "isn-t"', () => {
    const tags = extractTags("I'm planning a trip and it isn't cheap, the garden's dry")
    expect(tags).not.toContain('i-m')
    expect(tags).not.toContain('isn-t')
    expect(tags).not.toContain('garden-s')
    expect(tags).not.toContain('im')
    expect(tags.join(' ')).not.toMatch(/-/) // no hyphens anywhere
    expect(tags).toContain('garden') // possessive 's stripped, singular survives
  })

  it('splits hyphenated words instead of keeping fragments', () => {
    const tags = extractTags('a tool to auto-process podcast audio')
    expect(tags).not.toContain('auto-process')
    expect(tags).toContain('podcast')
    expect(tags).toContain('process')
  })

  it('drops stop words, gerund fillers and short tokens', () => {
    const tags = extractTags('the and for to a an it building designing error budget')
    expect(tags).not.toContain('the')
    expect(tags).not.toContain('building')
    expect(tags).not.toContain('designing')
    expect(tags).toContain('error')
    expect(tags).toContain('budget')
  })

  it('respects max and returns nothing for content-free text', () => {
    expect(extractTags('alpha beta gamma delta epsilon zeta', 4).length).toBe(4)
    expect(extractTags('the and for to of a an it')).toEqual([])
  })
})

describe('normalizeTag', () => {
  it('coerces an arbitrary tag to a single lowercase singular word', () => {
    expect(normalizeTag('Irrigation')).toBe('irrigation')
    expect(normalizeTag('auto-process')).toBe('auto')
    expect(normalizeTag('Rates')).toBe('rate')
    expect(normalizeTag("I'm")).toBe('') // too short after stripping
    expect(normalizeTag('123')).toBe('')
  })
})
