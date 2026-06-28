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
let app: ReturnType<typeof createApp>

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-sessions-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  authToken = signToken('test@example.com')
  app = createApp(db)
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`)

describe('GET /sessions/:id/status', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/sessions/sess-1/status')
    expect(res.status).toBe(401)
  })

  it('returns 404 for an unknown session', async () => {
    const res = await auth(request(app).get('/sessions/nope/status'))
    expect(res.status).toBe(404)
  })

  it('returns the stored status after an upsert', async () => {
    await auth(request(app).post('/sessions/sess-1/status')).send({ status: 'running' })
    const res = await auth(request(app).get('/sessions/sess-1/status'))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 'sess-1', status: 'running' })
    expect(typeof res.body.updatedAt).toBe('number')
  })
})

describe('POST /sessions/:id/status', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/sessions/sess-1/status').send({ status: 'running' })
    expect(res.status).toBe(401)
  })

  it('rejects an invalid status', async () => {
    const res = await auth(request(app).post('/sessions/sess-1/status')).send({ status: 'bogus' })
    expect(res.status).toBe(400)
  })

  it('rejects a missing status', async () => {
    const res = await auth(request(app).post('/sessions/sess-1/status')).send({})
    expect(res.status).toBe(400)
  })

  it('upserts: a later status overwrites the earlier one', async () => {
    await auth(request(app).post('/sessions/sess-1/status')).send({ status: 'running' })
    await auth(request(app).post('/sessions/sess-1/status')).send({ status: 'complete' })
    const res = await auth(request(app).get('/sessions/sess-1/status'))
    expect(res.body.status).toBe('complete')
  })

  it('accepts every valid status', async () => {
    for (const status of ['running', 'idle', 'complete', 'error']) {
      const res = await auth(request(app).post(`/sessions/s-${status}/status`)).send({ status })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ status })
    }
  })
})
