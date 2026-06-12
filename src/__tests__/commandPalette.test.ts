import { describe, it, expect } from 'vitest'
import { fuzzyMatch, COMMAND_DEFS } from '../CommandPalette'

describe('fuzzyMatch', () => {
  it('matches when query chars appear in order', () => {
    expect(fuzzyMatch('nc', 'New chat')).toBe(true)
  })

  it('returns false when chars do not all appear', () => {
    expect(fuzzyMatch('xyz', 'New chat')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('NC', 'New chat')).toBe(true)
    expect(fuzzyMatch('new', 'NEW CHAT')).toBe(true)
  })

  it('returns true for empty query', () => {
    expect(fuzzyMatch('', 'New chat')).toBe(true)
  })

  it('requires chars in order, not just presence', () => {
    // 'tc' — 't' comes after 'c' in 'New chat', so this should fail
    expect(fuzzyMatch('tc', 'New chat')).toBe(false)
    // 'ct' — 'c' then 't' both appear in order in 'New chat'
    expect(fuzzyMatch('ct', 'New chat')).toBe(true)
  })

  it('matches exact label', () => {
    expect(fuzzyMatch('zoom to fit', 'Zoom to fit')).toBe(true)
  })

  it('returns false when query is longer than label', () => {
    expect(fuzzyMatch('zoom to fit extra', 'Zoom to fit')).toBe(false)
  })
})

describe('COMMAND_DEFS', () => {
  it('has at least 8 entries', () => {
    expect(COMMAND_DEFS.length).toBeGreaterThanOrEqual(8)
  })

  it('each entry has an id and label', () => {
    for (const cmd of COMMAND_DEFS) {
      expect(typeof cmd.id).toBe('string')
      expect(cmd.id.length).toBeGreaterThan(0)
      expect(typeof cmd.label).toBe('string')
      expect(cmd.label.length).toBeGreaterThan(0)
    }
  })

  it('includes expected commands', () => {
    const labels = COMMAND_DEFS.map(c => c.label)
    expect(labels).toContain('New chat')
    expect(labels).toContain('Import chats')
    expect(labels).toContain('Group clusters')
    expect(labels).toContain('Toggle ink')
    expect(labels).toContain('Zoom to fit')
    expect(labels).toContain('Zoom in')
    expect(labels).toContain('Zoom out')
    expect(labels).toContain('Select all')
    expect(labels).toContain('Delete selected')
  })

  it('ids are unique', () => {
    const ids = COMMAND_DEFS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
