import { describe, it, expect } from 'vitest'
import { computeConnectedIds, isFocusDimmed, nodeArtifactId, type FocusNode } from '../FocusContext'

const node = (id: string, tags: string[], sourceThreadId: string | null = null): FocusNode => ({
  id, tags, artifactId: nodeArtifactId(id), sourceThreadId,
})

describe('nodeArtifactId', () => {
  it('parses the artifact id out of a node shape id', () => {
    expect(nodeArtifactId('shape:thread-abc123')).toBe('abc123')
    expect(nodeArtifactId('shape:project-linear-9f')).toBe('linear-9f')
    expect(nodeArtifactId('shape:idea-xy')).toBe('xy')
    expect(nodeArtifactId('shape:musing-1')).toBeNull()
  })
})

describe('computeConnectedIds — tag-derived', () => {
  const nodes = [
    node('shape:thread-a', ['backlinks', 'canvas']),
    node('shape:thread-b', ['backlinks', 'rollout']), // shares "backlinks"
    node('shape:thread-c', ['CANVAS']),               // shares "canvas" (case-insensitive)
    node('shape:thread-d', ['cooking']),              // shares nothing
  ]

  it('connects nodes that share at least one tag (case-insensitive), excluding self', () => {
    const c = computeConnectedIds(nodes, 'shape:thread-a')
    expect([...c].sort()).toEqual(['shape:thread-b', 'shape:thread-c'])
    expect(c.has('shape:thread-a')).toBe(false)
    expect(c.has('shape:thread-d')).toBe(false)
  })

  it('returns an empty set for an unknown focused id', () => {
    expect(computeConnectedIds(nodes, 'shape:thread-zzz').size).toBe(0)
  })
})

describe('computeConnectedIds — structural (Thread ↔ Idea, dormant path)', () => {
  it('connects an Idea to its source Thread via sourceThreadId, both directions', () => {
    const thread = node('shape:thread-T1', [])           // artifactId 'T1'
    const idea = node('shape:idea-I1', [], 'T1')         // sourceThreadId → T1
    const other = node('shape:thread-T2', [])
    const nodes = [thread, idea, other]
    // focus the thread → its idea is connected
    expect([...computeConnectedIds(nodes, 'shape:thread-T1')]).toContain('shape:idea-I1')
    // focus the idea → its thread is connected
    expect([...computeConnectedIds(nodes, 'shape:idea-I1')]).toContain('shape:thread-T1')
    // unrelated thread is not
    expect(computeConnectedIds(nodes, 'shape:thread-T1').has('shape:thread-T2')).toBe(false)
  })
})

describe('isFocusDimmed', () => {
  const connected = new Set(['shape:thread-b'])
  it('is false when nothing is focused', () => {
    expect(isFocusDimmed('shape:thread-x', null, connected)).toBe(false)
  })
  it('is false for the focused node itself and its connections', () => {
    expect(isFocusDimmed('shape:thread-a', 'shape:thread-a', connected)).toBe(false)
    expect(isFocusDimmed('shape:thread-b', 'shape:thread-a', connected)).toBe(false)
  })
  it('is true for everything else while focused', () => {
    expect(isFocusDimmed('shape:thread-c', 'shape:thread-a', connected)).toBe(true)
  })
})
