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

// Build a mock Anthropic client via explicit iterator — avoids async-generator
// syntax inside vi.mock factories which doesn't work reliably in Vitest 4 node env.
function makeAnthropicMock(): AnthropicLike {
  const streamEvents = [
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
  ]

  function makeStream() {
    let idx = 0
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<unknown, unknown>> {
            if (idx < streamEvents.length) {
              return Promise.resolve({ value: streamEvents[idx++], done: false as const })
            }
            return Promise.resolve({ value: undefined, done: true as const })
          },
        }
      },
      finalMessage() {
        return Promise.resolve({ usage: { input_tokens: 10, output_tokens: 5 } })
      },
    }
  }

  return {
    messages: {
      stream: vi.fn().mockImplementation(makeStream),
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"title":"Test Chat","body":"A short test summary."}' }],
        usage: { input_tokens: 5, output_tokens: 20 },
      }),
    },
  }
}

let app: ReturnType<typeof createApp>
let db: Database.Database
let dbPath: string
let authToken: string

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'

  dbPath = path.join(os.tmpdir(), `test-inference-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  app = createApp(db, makeAnthropicMock())
  authToken = signToken('test@example.com')
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

describe('POST /inference — auth guard', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/inference')
      .send({ artifactId: 'test-id', modelId: 'claude-sonnet-4-6', messages: [], stream: true })
    expect(res.status).toBe(401)
  })
})

describe('POST /inference — SSE streaming', () => {
  const body = {
    artifactId: 'artifact-001',
    modelId: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true,
  }

  it('returns 200 with text/event-stream content-type', async () => {
    const res = await request(app)
      .post('/inference')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
  })

  it('SSE response contains delta events for each token', async () => {
    const res = await request(app)
      .post('/inference')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
    expect(res.text).toContain('data: {"delta":"Hello"}')
    expect(res.text).toContain('data: {"delta":" world"}')
  })

  it('SSE response contains a summary event', async () => {
    const res = await request(app)
      .post('/inference')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
    expect(res.text).toContain('"summary"')
    expect(res.text).toContain('"title"')
    expect(res.text).toContain('"body"')
  })

  it('summary event appears before DONE', async () => {
    const res = await request(app)
      .post('/inference')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
    expect(res.text.indexOf('"summary"')).toBeLessThan(res.text.indexOf('[DONE]'))
  })

  it('SSE response ends with data: [DONE]', async () => {
    const res = await request(app)
      .post('/inference')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body)
    expect(res.text).toContain('data: [DONE]')
  })
})

describe('POST /inference — cost logging', () => {
  it('inserts a row into inference_log with artifact_id, model, tokens, cost', async () => {
    await request(app)
      .post('/inference')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        artifactId: 'artifact-002',
        modelId: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      })

    const row = db.prepare('SELECT * FROM inference_log WHERE artifact_id = ?').get('artifact-002') as {
      model: string
      input_tokens: number
      output_tokens: number
      cost_usd: number
      artifact_id: string
    } | undefined

    expect(row).toBeDefined()
    expect(row?.model).toBe('claude-sonnet-4-6')
    expect(row?.artifact_id).toBe('artifact-002')
    expect(row?.input_tokens).toBeGreaterThan(0)
    expect(row?.output_tokens).toBeGreaterThan(0)
    expect(row?.cost_usd).toBeGreaterThanOrEqual(0)
  })
})
