import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../index'
import type { AnthropicLike } from '../index'
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

// Same injection pattern as inference.test.ts — pass the mock to createApp.
// `payload` is what the model "returns" as its JSON link array.
function makeAnthropicMock(payload: unknown): AnthropicLike {
  return {
    messages: {
      stream: vi.fn().mockImplementation(() => {
        throw new Error('stream should not be called by the linking skill')
      }),
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        usage: { input_tokens: 500, output_tokens: 80 },
      }),
    },
  }
}

let db: Database.Database
let dbPath: string
let authToken: string

function insertArtifact(id: string, title = `Artifact ${id}`, content = 'some content') {
  db.prepare(
    'INSERT INTO artifacts (id, type, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'chat', title, content, Date.now(), Date.now())
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-linking-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  authToken = signToken('test@example.com')
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

describe('POST /linking/run — auth & validation', () => {
  it('returns 401 without a token', async () => {
    const app = createApp(db, makeAnthropicMock([]))
    const res = await request(app).post('/linking/run').send({ artifactId: 'x' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when artifactId is missing', async () => {
    const app = createApp(db, makeAnthropicMock([]))
    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 when the artifact does not exist', async () => {
    const app = createApp(db, makeAnthropicMock([]))
    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'no-such-artifact' })
    expect(res.status).toBe(404)
  })
})

describe('POST /linking/run — linking pipeline', () => {
  it('returns linked: 0 and makes no API call when there are no candidates', async () => {
    insertArtifact('art-target')
    const mock = makeAnthropicMock([])
    const app = createApp(db, mock)

    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    expect(res.status).toBe(200)
    expect(res.body.linked).toBe(0)
    expect(mock.messages.create).not.toHaveBeenCalled()
  })

  it('filters out links below the 0.5 confidence threshold', async () => {
    insertArtifact('art-target')
    insertArtifact('art-2')
    insertArtifact('art-3')
    const mock = makeAnthropicMock([
      { targetId: 'art-2', type: 'same-topic', confidence: 0.9, rationale: 'closely related' },
      { targetId: 'art-3', type: 'references', confidence: 0.3, rationale: 'weak signal' },
    ])
    const app = createApp(db, mock)

    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    expect(res.body.linked).toBe(1)
    const rows = db.prepare('SELECT * FROM artifact_links WHERE source_id = ?').all('art-target') as Array<{
      target_id: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0].target_id).toBe('art-2')
  })

  it('aborts without an API call when estimated input tokens exceed the ceiling', async () => {
    insertArtifact('art-target')
    // 81 candidates × 100 tokens = 8100 > 8000 ceiling
    for (let i = 0; i < 81; i++) insertArtifact(`art-bulk-${i}`)
    const mock = makeAnthropicMock([
      { targetId: 'art-bulk-0', type: 'same-topic', confidence: 0.9, rationale: 'x' },
    ])
    const app = createApp(db, mock)

    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    expect(res.status).toBe(200)
    expect(res.body.linked).toBe(0)
    expect(mock.messages.create).not.toHaveBeenCalled()
  })

  it('upserts links with provenance model-drawn', async () => {
    insertArtifact('art-target')
    insertArtifact('art-2')
    const app = createApp(db, makeAnthropicMock([
      { targetId: 'art-2', type: 'continuation', confidence: 0.8, rationale: 'follows on' },
    ]))

    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    expect(res.body.linked).toBe(1)
    const row = db.prepare('SELECT * FROM artifact_links WHERE source_id = ? AND target_id = ?')
      .get('art-target', 'art-2') as {
        provenance: string; confidence: number; strength: number; link_type: string
      } | undefined
    expect(row).toBeDefined()
    expect(row?.provenance).toBe('model-drawn')
    expect(row?.link_type).toBe('continuation')
    expect(row?.confidence).toBeCloseTo(0.8)
    expect(row?.strength).toBeCloseTo(0.8)
  })

  it('re-running updates the existing row instead of duplicating', async () => {
    insertArtifact('art-target')
    insertArtifact('art-2')

    const app1 = createApp(db, makeAnthropicMock([
      { targetId: 'art-2', type: 'same-topic', confidence: 0.6, rationale: 'maybe' },
    ]))
    await request(app1)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    const app2 = createApp(db, makeAnthropicMock([
      { targetId: 'art-2', type: 'same-project', confidence: 0.95, rationale: 'definitely' },
    ]))
    const res2 = await request(app2)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    expect(res2.body.linked).toBe(1)
    const rows = db.prepare('SELECT * FROM artifact_links WHERE source_id = ?').all('art-target') as Array<{
      strength: number; confidence: number; link_type: string; provenance: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0].strength).toBeCloseTo(0.95)
    expect(rows[0].confidence).toBeCloseTo(0.95)
    expect(rows[0].link_type).toBe('same-project')
    expect(rows[0].provenance).toBe('model-drawn')
  })

  it('ignores hallucinated target ids that are not real candidates', async () => {
    insertArtifact('art-target')
    insertArtifact('art-2')
    const app = createApp(db, makeAnthropicMock([
      { targetId: 'art-2', type: 'same-topic', confidence: 0.9, rationale: 'real' },
      { targetId: 'art-made-up', type: 'same-topic', confidence: 0.9, rationale: 'hallucinated' },
    ]))

    const res = await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    expect(res.body.linked).toBe(1)
  })

  it('logs a row to inference_log with feature linking', async () => {
    insertArtifact('art-target')
    insertArtifact('art-2')
    const app = createApp(db, makeAnthropicMock([
      { targetId: 'art-2', type: 'same-topic', confidence: 0.7, rationale: 'related' },
    ]))

    await request(app)
      .post('/linking/run')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ artifactId: 'art-target' })

    const row = db.prepare('SELECT * FROM inference_log WHERE feature = ?').get('linking') as {
      model: string; input_tokens: number; output_tokens: number; cost_usd: number; artifact_id: string
    } | undefined
    expect(row).toBeDefined()
    expect(row?.model).toBe('claude-haiku-4-5-20251001')
    expect(row?.artifact_id).toBe('art-target')
    expect(row?.input_tokens).toBeGreaterThan(0)
    expect(row?.output_tokens).toBeGreaterThan(0)
    expect(row?.cost_usd).toBeGreaterThan(0)
  })
})
