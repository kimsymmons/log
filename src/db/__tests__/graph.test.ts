// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { getDb } from '../schema'
import { insertArtifact } from '../artifacts'
import { insertLink, getLinksForArtifact } from '../links'
import { exportGraph, restoreGraph } from '../graph'
let db: Database

beforeEach(() => {
  db = getDb(':memory:')
})

afterEach(() => {
  db.close()
})

function makeArtifact(db: Database) {
  return insertArtifact(db, {
    type: 'note',
    title: 'T',
    content: null,
    canvas_x: 0,
    canvas_y: 0,
    canvas_w: 100,
    canvas_h: 100,
  })
}

describe('link provenance and confidence', () => {
  it('inserts a model-drawn link with confidence < 1', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const link = insertLink(db, {
      source_id: a1.id,
      target_id: a2.id,
      strength: 0.8,
      link_type: 'semantic',
      tags: null,
      provenance: 'model-drawn',
      confidence: 0.72,
    })
    expect(link.provenance).toBe('model-drawn')
    expect(link.confidence).toBeCloseTo(0.72)
  })

  it('inserts a user-pinned link with default confidence 1.0', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const link = insertLink(db, {
      source_id: a1.id,
      target_id: a2.id,
      strength: 1.0,
      link_type: 'explicit',
      tags: null,
      provenance: 'user-pinned',
      confidence: 1.0,
    })
    expect(link.provenance).toBe('user-pinned')
    expect(link.confidence).toBe(1.0)
  })

  it('inserts a user-made link', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const link = insertLink(db, {
      source_id: a1.id,
      target_id: a2.id,
      strength: 1.0,
      link_type: 'explicit',
      tags: null,
      provenance: 'user-made',
      confidence: 1.0,
    })
    expect(link.provenance).toBe('user-made')
  })

  it('inserts a dismissed link', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const link = insertLink(db, {
      source_id: a1.id,
      target_id: a2.id,
      strength: 0.0,
      link_type: 'semantic',
      tags: null,
      provenance: 'dismissed',
      confidence: 0.0,
    })
    expect(link.provenance).toBe('dismissed')
  })

  it('defaults provenance to user-made when not provided', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const link = insertLink(db, {
      source_id: a1.id,
      target_id: a2.id,
      strength: 1.0,
      link_type: 'explicit',
      tags: null,
    })
    expect(link.provenance).toBe('user-made')
    expect(link.confidence).toBe(1.0)
  })
})

describe('getLinksForArtifact ordering', () => {
  it('returns links ordered by confidence DESC', async () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const a3 = makeArtifact(db)
    const a4 = makeArtifact(db)

    insertLink(db, { source_id: a1.id, target_id: a2.id, strength: 0.5, link_type: 'semantic', tags: null, provenance: 'model-drawn', confidence: 0.5 })
    insertLink(db, { source_id: a1.id, target_id: a3.id, strength: 0.9, link_type: 'semantic', tags: null, provenance: 'model-drawn', confidence: 0.9 })
    insertLink(db, { source_id: a1.id, target_id: a4.id, strength: 1.0, link_type: 'explicit', tags: null, provenance: 'user-pinned', confidence: 1.0 })

    const links = getLinksForArtifact(db, a1.id)
    expect(links[0].confidence).toBe(1.0)
    expect(links[1].confidence).toBe(0.9)
    expect(links[2].confidence).toBe(0.5)
  })
})

describe('exportGraph', () => {
  it('returns { version, exportedAt, artifacts, links }', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    insertLink(db, { source_id: a1.id, target_id: a2.id, strength: 1.0, link_type: 'explicit', tags: null })

    const result = exportGraph(db)
    expect(result.version).toBe(1)
    expect(typeof result.exportedAt).toBe('string')
    expect(result.artifacts).toHaveLength(2)
    expect(result.links).toHaveLength(1)
  })

  it('includes all artifacts and links in the export', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    const a3 = makeArtifact(db)
    insertLink(db, { source_id: a1.id, target_id: a2.id, strength: 0.8, link_type: 'semantic', tags: null, provenance: 'model-drawn', confidence: 0.8 })
    insertLink(db, { source_id: a2.id, target_id: a3.id, strength: 1.0, link_type: 'explicit', tags: null, provenance: 'user-made', confidence: 1.0 })

    const result = exportGraph(db)
    expect(result.artifacts).toHaveLength(3)
    expect(result.links).toHaveLength(2)
    expect(result.links[0].provenance).toBeDefined()
    expect(result.links[0].confidence).toBeDefined()
  })
})

describe('restoreGraph', () => {
  it('clears existing data and restores from export', () => {
    const a1 = makeArtifact(db)
    const a2 = makeArtifact(db)
    insertLink(db, { source_id: a1.id, target_id: a2.id, strength: 1.0, link_type: 'explicit', tags: null })

    const exported = exportGraph(db)

    // add extra data that should be wiped
    makeArtifact(db)

    restoreGraph(db, exported)

    const afterRestore = exportGraph(db)
    expect(afterRestore.artifacts).toHaveLength(2)
    expect(afterRestore.links).toHaveLength(1)
  })

  it('round-trip export→restore produces identical artifacts and links', () => {
    const a1 = insertArtifact(db, {
      type: 'chat',
      title: 'Chat One',
      content: JSON.stringify([{ role: 'user', text: 'hello' }]),
      canvas_x: 10,
      canvas_y: 20,
      canvas_w: 300,
      canvas_h: 150,
    })
    const a2 = insertArtifact(db, {
      type: 'note',
      title: 'Note Two',
      content: 'Some text',
      canvas_x: 400,
      canvas_y: 100,
      canvas_w: 200,
      canvas_h: 200,
    })
    insertLink(db, {
      source_id: a1.id,
      target_id: a2.id,
      strength: 0.85,
      link_type: 'semantic',
      tags: JSON.stringify(['design']),
      provenance: 'model-drawn',
      confidence: 0.85,
    })

    const before = exportGraph(db)
    restoreGraph(db, before)
    const after = exportGraph(db)

    // Strip exportedAt (timestamp differs) and compare the rest
    expect(after.version).toBe(before.version)
    expect(after.artifacts).toHaveLength(before.artifacts.length)
    expect(after.links).toHaveLength(before.links.length)

    const beforeArtifact = before.artifacts.find(a => a.id === a1.id)!
    const afterArtifact = after.artifacts.find(a => a.id === a1.id)!
    expect(afterArtifact.title).toBe(beforeArtifact.title)
    expect(afterArtifact.canvas_x).toBe(beforeArtifact.canvas_x)
    expect(afterArtifact.type).toBe(beforeArtifact.type)

    const beforeLink = before.links[0]
    const afterLink = after.links.find(l => l.id === beforeLink.id)!
    expect(afterLink.source_id).toBe(beforeLink.source_id)
    expect(afterLink.target_id).toBe(beforeLink.target_id)
    expect(afterLink.provenance).toBe(beforeLink.provenance)
    expect(afterLink.confidence).toBeCloseTo(beforeLink.confidence)
  })
})
