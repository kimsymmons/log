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
import { findConnectedComponents } from '../clustering'
import { inferProjectType } from '../projectInference'

vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null })
  class MockResend { emails = { send: mockSend } }
  return { Resend: MockResend }
})

function makeAnthropicMock(inferPayload: unknown): AnthropicLike {
  return {
    messages: {
      stream: vi.fn().mockImplementation(() => {
        throw new Error('stream should not be called in clustering tests')
      }),
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(inferPayload) }],
        usage: { input_tokens: 100, output_tokens: 30 },
      }),
    },
  }
}

let db: Database.Database
let dbPath: string
let authToken: string

function insertArtifact(id: string, content = 'some content') {
  db.prepare(
    'INSERT INTO artifacts (id, type, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'chat', `Artifact ${id}`, content, Date.now(), Date.now())
}

function insertLink(sourceId: string, targetId: string, confidence = 0.8, provenance = 'model-drawn') {
  db.prepare(
    `INSERT INTO artifact_links (id, source_id, target_id, strength, link_type, provenance, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(`link-${sourceId}-${targetId}`, sourceId, targetId, confidence, 'same-project', provenance, confidence, Date.now())
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-clustering-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  authToken = signToken('test@example.com')
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

// ── findConnectedComponents (pure BFS) ───────────────────────────────────────

describe('findConnectedComponents', () => {
  it('returns empty array for empty input', () => {
    expect(findConnectedComponents([], [])).toEqual([])
  })

  it('each isolated node is its own component', () => {
    const components = findConnectedComponents(['a', 'b', 'c'], [])
    expect(components).toHaveLength(3)
    expect(components.map(c => c[0]).sort()).toEqual(['a', 'b', 'c'])
  })

  it('finds one component from a 3-node connected graph', () => {
    const components = findConnectedComponents(
      ['a', 'b', 'c'],
      [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]
    )
    expect(components).toHaveLength(1)
    expect(components[0].sort()).toEqual(['a', 'b', 'c'])
  })

  it('finds two separate components', () => {
    const components = findConnectedComponents(
      ['a', 'b', 'c', 'd'],
      [{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }]
    )
    expect(components).toHaveLength(2)
    const sorted = components.map(c => c.sort()).sort((a, b) => a[0].localeCompare(b[0]))
    expect(sorted[0]).toEqual(['a', 'b'])
    expect(sorted[1]).toEqual(['c', 'd'])
  })

  it('treats edges as undirected', () => {
    const components = findConnectedComponents(
      ['x', 'y'],
      [{ source: 'y', target: 'x' }]
    )
    expect(components).toHaveLength(1)
    expect(components[0].sort()).toEqual(['x', 'y'])
  })
})

// ── inferProjectType ─────────────────────────────────────────────────────────

describe('inferProjectType', () => {
  it('returns unknown without API call when fewer than 3 artifacts', async () => {
    const mock = makeAnthropicMock({ type: 'software', confidence: 0.9, rationale: 'code' })
    const result = await inferProjectType(
      [{ id: 'a1', content: 'hello' }, { id: 'a2', content: 'world' }],
      mock
    )
    expect(result.type).toBe('unknown')
    expect(result.confidence).toBe(0)
    expect(mock.messages.create).not.toHaveBeenCalled()
  })

  it('returns unknown for empty array without API call', async () => {
    const mock = makeAnthropicMock({ type: 'software', confidence: 0.9, rationale: 'code' })
    const result = await inferProjectType([], mock)
    expect(result.type).toBe('unknown')
    expect(mock.messages.create).not.toHaveBeenCalled()
  })

  it('calls the API when >= 3 artifacts and returns parsed result', async () => {
    const mock = makeAnthropicMock({ type: 'research', confidence: 0.85, rationale: 'academic papers' })
    const result = await inferProjectType(
      [
        { id: 'a1', content: 'paper on neural nets' },
        { id: 'a2', content: 'literature review' },
        { id: 'a3', content: 'experimental results' },
      ],
      mock
    )
    expect(result.type).toBe('research')
    expect(result.confidence).toBe(0.85)
    expect(result.rationale).toBe('academic papers')
    expect(mock.messages.create).toHaveBeenCalledOnce()
  })

  it('falls back to unknown if API returns invalid JSON', async () => {
    const mock: AnthropicLike = {
      messages: {
        stream: vi.fn(),
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not json at all' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    }
    const result = await inferProjectType(
      [{ id: 'a', content: 'x' }, { id: 'b', content: 'y' }, { id: 'c', content: 'z' }],
      mock
    )
    expect(result.type).toBe('unknown')
    expect(result.confidence).toBe(0)
  })
})

// ── suggestClusters ──────────────────────────────────────────────────────────

describe('suggestClusters', () => {
  it('returns empty array when no artifacts', async () => {
    const { suggestClusters } = await import('../clustering')
    const mock = makeAnthropicMock({ type: 'mixed', confidence: 0.5, rationale: 'test' })
    const result = await suggestClusters(db, mock)
    expect(result).toEqual([])
  })

  it('skips single-artifact components', async () => {
    const { suggestClusters } = await import('../clustering')
    // 3 artifacts, no links → 3 isolated components of size 1 → all skipped
    insertArtifact('a1', 'content one')
    insertArtifact('a2', 'content two')
    insertArtifact('a3', 'content three')
    const mock = makeAnthropicMock({ type: 'mixed', confidence: 0.5, rationale: 'test' })
    const result = await suggestClusters(db, mock)
    expect(result).toEqual([])
    expect(mock.messages.create).not.toHaveBeenCalled()
  })

  it('returns a cluster for a connected component of >= 3 artifacts', async () => {
    const { suggestClusters } = await import('../clustering')
    insertArtifact('a1', 'software code typescript')
    insertArtifact('a2', 'software code react')
    insertArtifact('a3', 'software code nodejs')
    insertArtifact('a4', 'isolated note')
    insertLink('a1', 'a2', 0.8, 'model-drawn')
    insertLink('a2', 'a3', 0.8, 'model-drawn')
    const mock = makeAnthropicMock({ type: 'software', confidence: 0.9, rationale: 'typescript code' })
    const result = await suggestClusters(db, mock)
    expect(result).toHaveLength(1)
    expect(result[0].artifactIds.sort()).toEqual(['a1', 'a2', 'a3'])
    expect(result[0].projectType).toBe('software')
    expect(result[0].confidence).toBe(0.9)
    expect(typeof result[0].id).toBe('string')
    expect(typeof result[0].label).toBe('string')
  })

  it('excludes dismissed links when building the graph', async () => {
    const { suggestClusters } = await import('../clustering')
    insertArtifact('a1', 'content')
    insertArtifact('a2', 'content')
    insertLink('a1', 'a2', 0.8, 'dismissed')
    const mock = makeAnthropicMock({ type: 'mixed', confidence: 0.5, rationale: 'test' })
    const result = await suggestClusters(db, mock)
    expect(result).toEqual([])
  })

  it('excludes low-confidence links (< 0.6)', async () => {
    const { suggestClusters } = await import('../clustering')
    insertArtifact('a1', 'content')
    insertArtifact('a2', 'content')
    insertLink('a1', 'a2', 0.4, 'model-drawn')
    const mock = makeAnthropicMock({ type: 'mixed', confidence: 0.5, rationale: 'test' })
    const result = await suggestClusters(db, mock)
    expect(result).toEqual([])
  })

  it('sorts results by artifactIds.length descending', async () => {
    const { suggestClusters } = await import('../clustering')
    // Component 1: a1-a2-a3 (size 3)
    // Component 2: b1-b2 (size 2)
    insertArtifact('a1', 'x'); insertArtifact('a2', 'y'); insertArtifact('a3', 'z')
    insertArtifact('b1', 'p'); insertArtifact('b2', 'q')
    insertLink('a1', 'a2'); insertLink('a2', 'a3')
    insertLink('b1', 'b2')
    const mock = makeAnthropicMock({ type: 'mixed', confidence: 0.6, rationale: 'test' })
    const result = await suggestClusters(db, mock)
    expect(result).toHaveLength(2)
    expect(result[0].artifactIds).toHaveLength(3)
    expect(result[1].artifactIds).toHaveLength(2)
  })
})

// ── Route: POST /clusters/suggest ───────────────────────────────────────────

describe('POST /clusters/suggest', () => {
  it('returns 401 without auth', async () => {
    const app = createApp(db, makeAnthropicMock({ type: 'mixed', confidence: 0.5, rationale: 't' }))
    const res = await request(app).post('/clusters/suggest').send({})
    expect(res.status).toBe(401)
  })

  it('returns 200 with an array when authenticated', async () => {
    insertArtifact('a1', 'content a'); insertArtifact('a2', 'content b')
    insertLink('a1', 'a2')
    const mock = makeAnthropicMock({ type: 'software', confidence: 0.8, rationale: 'code' })
    const app = createApp(db, mock)
    const res = await request(app)
      .post('/clusters/suggest')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 500 with a generic error message when Anthropic client throws', async () => {
    insertArtifact('a1', 'x'); insertArtifact('a2', 'y'); insertArtifact('a3', 'z')
    insertLink('a1', 'a2'); insertLink('a2', 'a3')
    const throwingMock: AnthropicLike = {
      messages: {
        stream: vi.fn(),
        create: vi.fn().mockRejectedValue(new Error('upstream API error')),
      },
    }
    const app = createApp(db, throwingMock)
    const res = await request(app)
      .post('/clusters/suggest')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
    // Should not expose a full stack trace — just an error message string
    expect(typeof res.body.error).toBe('string')
  })
})

// ── Route: POST /clusters/apply ─────────────────────────────────────────────

describe('POST /clusters/apply', () => {
  it('returns 401 without auth', async () => {
    const app = createApp(db, makeAnthropicMock({}))
    const res = await request(app).post('/clusters/apply').send({ clusterId: 'c1', label: 'test', artifactIds: [] })
    expect(res.status).toBe(401)
  })

  it('stores cluster in DB and returns ok', async () => {
    const app = createApp(db, makeAnthropicMock({}))
    const res = await request(app)
      .post('/clusters/apply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ clusterId: 'c1', label: 'My Cluster', artifactIds: ['a1', 'a2'] })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const row = db.prepare('SELECT * FROM clusters WHERE id = ?').get('c1') as { label: string; artifact_ids: string } | undefined
    expect(row?.label).toBe('My Cluster')
    expect(JSON.parse(row?.artifact_ids ?? '[]')).toEqual(['a1', 'a2'])
  })

  it('returns 400 when body is missing required fields', async () => {
    const app = createApp(db, makeAnthropicMock({}))
    const res = await request(app)
      .post('/clusters/apply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ label: 'no cluster id' })
    expect(res.status).toBe(400)
  })
})
