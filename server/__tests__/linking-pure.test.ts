import { describe, it, expect } from 'vitest'
import { buildLinkingPrompt, parseLinkingResponse, LINK_TYPES, CONFIDENCE_THRESHOLD } from '../linking'

describe('buildLinkingPrompt', () => {
  it('contains the source content', () => {
    const prompt = buildLinkingPrompt('hello world', [{ id: 'c1', content: 'other stuff' }])
    expect(prompt).toContain('hello world')
  })

  it('contains each candidate id and content', () => {
    const prompt = buildLinkingPrompt('source', [
      { id: 'cand-1', content: 'first candidate' },
      { id: 'cand-2', content: 'second candidate' },
    ])
    expect(prompt).toContain('cand-1')
    expect(prompt).toContain('first candidate')
    expect(prompt).toContain('cand-2')
    expect(prompt).toContain('second candidate')
  })

  it('returns a non-empty string', () => {
    const prompt = buildLinkingPrompt('x', [{ id: 'y', content: 'z' }])
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('mentions allowed link types', () => {
    const prompt = buildLinkingPrompt('src', [{ id: 'c', content: 'c' }])
    for (const t of LINK_TYPES) {
      expect(prompt).toContain(t)
    }
  })
})

describe('parseLinkingResponse', () => {
  it('extracts a valid link', () => {
    const raw = JSON.stringify([
      { targetId: 'a1', type: 'same-topic', confidence: 0.8, rationale: 'both discuss logs' },
    ])
    const result = parseLinkingResponse(raw, new Set(['a1']))
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ targetId: 'a1', type: 'same-topic', confidence: 0.8 })
  })

  it('returns empty array on malformed JSON', () => {
    expect(parseLinkingResponse('not json', new Set(['a1']))).toEqual([])
  })

  it('returns empty array when response is not an array', () => {
    expect(parseLinkingResponse('{"targetId":"a1"}', new Set(['a1']))).toEqual([])
  })

  it('filters out ids not in the valid set', () => {
    const raw = JSON.stringify([
      { targetId: 'real', type: 'same-topic', confidence: 0.9, rationale: 'ok' },
      { targetId: 'hallucinated', type: 'same-topic', confidence: 0.9, rationale: 'fake' },
    ])
    const result = parseLinkingResponse(raw, new Set(['real']))
    expect(result).toHaveLength(1)
    expect(result[0].targetId).toBe('real')
  })

  it(`filters confidence below ${CONFIDENCE_THRESHOLD}`, () => {
    const raw = JSON.stringify([
      { targetId: 'a1', type: 'references', confidence: 0.3, rationale: 'weak' },
      { targetId: 'a2', type: 'references', confidence: 0.8, rationale: 'strong' },
    ])
    const result = parseLinkingResponse(raw, new Set(['a1', 'a2']))
    expect(result).toHaveLength(1)
    expect(result[0].targetId).toBe('a2')
  })

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n[{"targetId":"a1","type":"continuation","confidence":0.7,"rationale":"ok"}]\n```'
    const result = parseLinkingResponse(raw, new Set(['a1']))
    expect(result).toHaveLength(1)
  })

  it('returns empty rationale when field is absent', () => {
    const raw = JSON.stringify([{ targetId: 'a1', type: 'same-topic', confidence: 0.6 }])
    const result = parseLinkingResponse(raw, new Set(['a1']))
    expect(result[0].rationale).toBe('')
  })

  it('ignores items with invalid link type', () => {
    const raw = JSON.stringify([
      { targetId: 'a1', type: 'made-up-type', confidence: 0.9, rationale: 'x' },
    ])
    expect(parseLinkingResponse(raw, new Set(['a1']))).toEqual([])
  })
})
