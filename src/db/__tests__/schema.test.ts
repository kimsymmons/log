// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ulid } from 'ulid'
import type { Database } from 'better-sqlite3'
import { getDb } from '../schema'
import { insertArtifact, getArtifact, updateArtifact, listArtifactsByType } from '../artifacts'
import { insertLink, getLinksForArtifact } from '../links'
import type { NewArtifact, NewArtifactLink, NewMemoryEntry } from '../../types/artifact'

let db: Database

beforeEach(() => {
  db = getDb(':memory:')
})

afterEach(() => {
  db.close()
})

describe('artifacts table', () => {
  it('inserts and retrieves a chat artifact', () => {
    const input: NewArtifact = {
      type: 'chat',
      title: 'Test Chat',
      content: JSON.stringify([{ role: 'user', text: 'hello' }]),
      canvas_x: 100,
      canvas_y: 200,
      canvas_w: 300,
      canvas_h: 150,
    }
    const inserted = insertArtifact(db, input)
    expect(inserted.id).toBeTruthy()
    expect(inserted.type).toBe('chat')
    expect(inserted.title).toBe('Test Chat')
    expect(inserted.synced_at).toBeNull()

    const fetched = getArtifact(db, inserted.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.title).toBe('Test Chat')
  })

  it('inserts all four artifact types', () => {
    const types = ['chat', 'project', 'note', 'sketch'] as const
    for (const type of types) {
      const a = insertArtifact(db, { type, title: type, content: null, canvas_x: 0, canvas_y: 0, canvas_w: 100, canvas_h: 100 })
      expect(a.type).toBe(type)
    }
    expect(listArtifactsByType(db, 'note')).toHaveLength(1)
    expect(listArtifactsByType(db, 'sketch')).toHaveLength(1)
  })

  it('positions persist exactly without float rounding loss', () => {
    const x = 123.456789
    const y = -987.654321
    const w = 0.000001
    const h = 99999.99999
    const a = insertArtifact(db, { type: 'note', title: null, content: null, canvas_x: x, canvas_y: y, canvas_w: w, canvas_h: h })
    const fetched = getArtifact(db, a.id)!
    expect(fetched.canvas_x).toBe(x)
    expect(fetched.canvas_y).toBe(y)
    expect(fetched.canvas_w).toBe(w)
    expect(fetched.canvas_h).toBe(h)
  })

  it('synced_at is null on creation and can be set', () => {
    const a = insertArtifact(db, { type: 'note', title: 'x', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })
    expect(a.synced_at).toBeNull()

    const now = Date.now()
    const updated = updateArtifact(db, a.id, { synced_at: now })
    expect(updated.synced_at).toBe(now)
  })

  it('returns null for a missing artifact', () => {
    expect(getArtifact(db, 'does-not-exist')).toBeNull()
  })
})

describe('artifact_links table', () => {
  it('stores an explicit link with strength 1.0', () => {
    const a1 = insertArtifact(db, { type: 'chat', title: 'A', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })
    const a2 = insertArtifact(db, { type: 'project', title: 'B', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })

    const link: NewArtifactLink = {
      source_id: a1.id,
      target_id: a2.id,
      strength: 1.0,
      link_type: 'explicit',
      tags: null,
    }
    const inserted = insertLink(db, link)
    expect(inserted.strength).toBe(1.0)
    expect(inserted.link_type).toBe('explicit')

    const links = getLinksForArtifact(db, a1.id)
    expect(links).toHaveLength(1)
    expect(links[0].target_id).toBe(a2.id)
  })

  it('stores a semantic link with strength between 0.0 and 0.99', () => {
    const a1 = insertArtifact(db, { type: 'note', title: 'N1', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })
    const a2 = insertArtifact(db, { type: 'note', title: 'N2', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })

    const link: NewArtifactLink = {
      source_id: a1.id,
      target_id: a2.id,
      strength: 0.72,
      link_type: 'semantic',
      tags: JSON.stringify(['design', 'ux']),
    }
    const inserted = insertLink(db, link)
    expect(inserted.strength).toBe(0.72)
    expect(inserted.link_type).toBe('semantic')
  })

  it('getLinksForArtifact filters by minStrength', () => {
    const a1 = insertArtifact(db, { type: 'chat', title: 'C', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })
    const a2 = insertArtifact(db, { type: 'note', title: 'N', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })
    const a3 = insertArtifact(db, { type: 'sketch', title: 'S', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })

    insertLink(db, { source_id: a1.id, target_id: a2.id, strength: 0.9, link_type: 'semantic', tags: null })
    insertLink(db, { source_id: a1.id, target_id: a3.id, strength: 0.3, link_type: 'semantic', tags: null })

    const strong = getLinksForArtifact(db, a1.id, 0.5)
    expect(strong).toHaveLength(1)
    expect(strong[0].target_id).toBe(a2.id)

    const all = getLinksForArtifact(db, a1.id)
    expect(all).toHaveLength(2)
  })
})

describe('memory_entries table', () => {
  it('stores and retrieves a memory entry', () => {
    const a = insertArtifact(db, { type: 'chat', title: 'M', content: null, canvas_x: 0, canvas_y: 0, canvas_w: 0, canvas_h: 0 })

    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer)
    const entry: NewMemoryEntry = {
      artifact_id: a.id,
      embedding_model: 'text-embedding-3-small',
      content: 'A summary of the chat',
      embedding,
    }

    const id = ulid()
    const now = Date.now()
    db.prepare(
      'INSERT INTO memory_entries (id, artifact_id, embedding_model, content, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, entry.artifact_id, entry.embedding_model, entry.content, entry.embedding, now)

    const row = db.prepare<string[], { id: string; artifact_id: string; embedding_model: string; content: string; embedding: Buffer; created_at: number }>(
      'SELECT * FROM memory_entries WHERE id = ?'
    ).get(id)

    expect(row).not.toBeUndefined()
    expect(row!.artifact_id).toBe(a.id)
    expect(row!.content).toBe('A summary of the chat')
    expect(row!.embedding_model).toBe('text-embedding-3-small')
    expect(row!.embedding).toBeInstanceOf(Buffer)
    expect(row!.embedding.byteLength).toBe(12) // 3 float32s × 4 bytes
  })
})
