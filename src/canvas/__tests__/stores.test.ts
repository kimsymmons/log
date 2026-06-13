import { describe, it, expect, beforeEach } from 'vitest'
import {
  ensureTag,
  getTagDefs,
  tagColorFor,
  tagId,
} from '../tagStore'
import { getPosition, setPosition } from '../positionStore'

// Minimal in-memory Storage for deterministic tests.
function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => Array.from(m.keys())[i] ?? null,
  }
}

let s: Storage
beforeEach(() => { s = memStorage() })

describe('tagStore', () => {
  it('slugs labels to stable ids', () => {
    expect(tagId('  Backlinks Debate ')).toBe('backlinks-debate')
  })

  it('creates a def with the next colour in the cycle', () => {
    const a = ensureTag('alpha', s)
    const b = ensureTag('beta', s)
    expect(a.color).toBe('yellow')
    expect(b.color).toBe('green')
    expect(getTagDefs(s)).toHaveLength(2)
  })

  it('ensureTag is idempotent for the same label', () => {
    const a = ensureTag('Spec', s)
    const again = ensureTag('spec', s)
    expect(again).toEqual(a)
    expect(getTagDefs(s)).toHaveLength(1)
  })

  it('returns a stable colour for a registered tag', () => {
    ensureTag('design', s)
    expect(tagColorFor('design', s)).toBe('yellow')
  })

  it('falls back to a derived colour for unknown labels', () => {
    expect(['yellow', 'green', 'blue', 'purple', 'pink', 'gray']).toContain(tagColorFor('never-seen', s))
  })
})

describe('positionStore', () => {
  it('returns null when no position is stored', () => {
    expect(getPosition('art-1', s)).toBeNull()
  })

  it('round-trips a position', () => {
    setPosition('art-1', { x: 10, y: 20 }, s)
    expect(getPosition('art-1', s)).toEqual({ x: 10, y: 20 })
  })

  it('overwrites an existing position', () => {
    setPosition('art-1', { x: 1, y: 2 }, s)
    setPosition('art-1', { x: 3, y: 4 }, s)
    expect(getPosition('art-1', s)).toEqual({ x: 3, y: 4 })
  })
})
