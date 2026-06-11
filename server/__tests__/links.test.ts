import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../index'
import { getServerDb } from '../db'
import { signToken } from '../jwt'
import Database from 'better-sqlite3'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null })
  class MockResend { emails = { send: mockSend } }
  return { Resend: MockResend }
})

let db: Database.Database
let dbPath: string
let authToken: string

function insertArtifact(id: string, title = `Artifact ${id}`) {
  db.prepare(
    'INSERT INTO artifacts (id, type, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'chat', title, 'content', Date.now(), Date.now())
}

function insertLink(id: string, sourceId: string, targetId: string, opts: {
  strength?: number
  provenance?: string
  rationale?: string
} = {}) {
  db.prepare(
    `INSERT INTO artifact_links (id, source_id, target_id, strength, provenance, rationale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, sourceId, targetId,
    opts.strength ?? 0.8,
    opts.provenance ?? 'model-drawn',
    opts.rationale ?? null,
    Date.now()
  )
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-links-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  authToken = signToken('test@example.com')
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

// ── GET /links ───────────────────────────────────────────────────────────────

describe('GET /links', () => {
  it('returns 401 without auth', async () => {
    const app = createApp(db)
    const res = await request(app).get('/links?artifactId=x')
    expect(res.status).toBe(401)
  })

  it('returns 400 when artifactId is missing', async () => {
    const app = createApp(db)
    const res = await request(app)
      .get('/links')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(400)
  })

  it('returns empty array when no links exist', async () => {
    const app = createApp(db)
    const res = await request(app)
      .get('/links?artifactId=art-1')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns non-dismissed links where artifactId is source', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2', { strength: 0.9, provenance: 'model-drawn', rationale: 'closely related' })
    const app = createApp(db)
    const res = await request(app)
      .get('/links?artifactId=art-1')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('link-1')
    expect(res.body[0].source_id).toBe('art-1')
    expect(res.body[0].target_id).toBe('art-2')
    expect(res.body[0].strength).toBeCloseTo(0.9)
    expect(res.body[0].provenance).toBe('model-drawn')
    expect(res.body[0].rationale).toBe('closely related')
  })

  it('returns non-dismissed links where artifactId is target', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2', { provenance: 'user-pinned' })
    const app = createApp(db)
    const res = await request(app)
      .get('/links?artifactId=art-2')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('link-1')
  })

  it('excludes dismissed links', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertArtifact('art-3')
    insertLink('link-1', 'art-1', 'art-2', { provenance: 'model-drawn' })
    insertLink('link-2', 'art-1', 'art-3', { provenance: 'dismissed' })
    const app = createApp(db)
    const res = await request(app)
      .get('/links?artifactId=art-1')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('link-1')
  })

  it('returns links below strength 0.5 (filtering is rendering-side, not query-side)', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2', { strength: 0.3 })
    const app = createApp(db)
    const res = await request(app)
      .get('/links?artifactId=art-1')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})

// ── PATCH /links/:id ─────────────────────────────────────────────────────────

describe('PATCH /links/:id', () => {
  it('returns 401 without auth', async () => {
    const app = createApp(db)
    const res = await request(app).patch('/links/link-1').send({ provenance: 'user-pinned' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when provenance is missing', async () => {
    const app = createApp(db)
    const res = await request(app)
      .patch('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 when provenance is invalid', async () => {
    const app = createApp(db)
    const res = await request(app)
      .patch('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provenance: 'hacked' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when link does not exist', async () => {
    const app = createApp(db)
    const res = await request(app)
      .patch('/links/no-such-link')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provenance: 'user-pinned' })
    expect(res.status).toBe(404)
  })

  it('updates provenance to user-pinned', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2', { provenance: 'model-drawn' })
    const app = createApp(db)
    const res = await request(app)
      .patch('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provenance: 'user-pinned' })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT provenance FROM artifact_links WHERE id = ?').get('link-1') as { provenance: string }
    expect(row.provenance).toBe('user-pinned')
  })

  it('updates provenance to dismissed', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2')
    const app = createApp(db)
    const res = await request(app)
      .patch('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provenance: 'dismissed' })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT provenance FROM artifact_links WHERE id = ?').get('link-1') as { provenance: string }
    expect(row.provenance).toBe('dismissed')
  })

  it('logs the action to link_feedback', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2')
    const app = createApp(db)
    await request(app)
      .patch('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provenance: 'user-pinned' })
    const row = db.prepare('SELECT * FROM link_feedback WHERE link_id = ?').get('link-1') as {
      link_id: string; action: string; created_at: number
    } | undefined
    expect(row).toBeDefined()
    expect(row?.link_id).toBe('link-1')
    expect(row?.action).toBe('keep')
    expect(row?.created_at).toBeGreaterThan(0)
  })

  it('logs "dismiss" action when provenance is dismissed', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2')
    const app = createApp(db)
    await request(app)
      .patch('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ provenance: 'dismissed' })
    const row = db.prepare('SELECT action FROM link_feedback WHERE link_id = ?').get('link-1') as { action: string } | undefined
    expect(row?.action).toBe('dismiss')
  })
})

// ── DELETE /links/:id ────────────────────────────────────────────────────────

describe('DELETE /links/:id', () => {
  it('returns 401 without auth', async () => {
    const app = createApp(db)
    const res = await request(app).delete('/links/link-1')
    expect(res.status).toBe(401)
  })

  it('returns 404 when link does not exist', async () => {
    const app = createApp(db)
    const res = await request(app)
      .delete('/links/no-such-link')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(404)
  })

  it('deletes the link', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2')
    const app = createApp(db)
    const res = await request(app)
      .delete('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM artifact_links WHERE id = ?').get('link-1')
    expect(row).toBeUndefined()
  })

  it('logs the remove action to link_feedback', async () => {
    insertArtifact('art-1')
    insertArtifact('art-2')
    insertLink('link-1', 'art-1', 'art-2')
    const app = createApp(db)
    await request(app)
      .delete('/links/link-1')
      .set('Authorization', `Bearer ${authToken}`)
    const row = db.prepare('SELECT * FROM link_feedback WHERE link_id = ?').get('link-1') as {
      link_id: string; action: string
    } | undefined
    expect(row).toBeDefined()
    expect(row?.link_id).toBe('link-1')
    expect(row?.action).toBe('remove')
  })
})

// ── DB schema: rationale column ───────────────────────────────────────────────

describe('artifact_links schema', () => {
  it('has a rationale column', () => {
    const cols = db.pragma('table_info(artifact_links)') as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('rationale')
  })
})

describe('link_feedback schema', () => {
  it('link_feedback table exists with required columns', () => {
    const cols = db.pragma('table_info(link_feedback)') as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('link_id')
    expect(names).toContain('action')
    expect(names).toContain('created_at')
  })
})
