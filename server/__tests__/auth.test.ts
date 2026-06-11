import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../index'
import { getServerDb } from '../db'
import Database from 'better-sqlite3'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

// Mock Resend so tests don't send real emails
vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null })
  class MockResend {
    emails = { send: mockSend }
  }
  return { Resend: MockResend }
})

let app: ReturnType<typeof createApp>
let db: Database.Database
let dbPath: string

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.APP_URL = 'http://localhost:3001'

  dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`)
  db = getServerDb(dbPath)
  app = createApp(db)
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

describe('POST /auth/request', () => {
  it('stores a token in the DB for a valid email', async () => {
    const res = await request(app).post('/auth/request').send({ email: 'test@example.com' })
    expect(res.status).toBe(200)

    const row = db.prepare('SELECT * FROM auth_tokens WHERE email = ?').get('test@example.com') as { email: string; id: string } | undefined
    expect(row).toBeDefined()
    expect(row?.email).toBe('test@example.com')
  })

  it('returns 400 for missing email', async () => {
    const res = await request(app).post('/auth/request').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /auth/verify', () => {
  it('returns a JWT and deletes the token for a valid token', async () => {
    await request(app).post('/auth/request').send({ email: 'test@example.com' })
    const row = db.prepare('SELECT id FROM auth_tokens WHERE email = ?').get('test@example.com') as { id: string }

    const res = await request(app).get(`/auth/verify?token=${row.id}`)
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()

    const deleted = db.prepare('SELECT * FROM auth_tokens WHERE id = ?').get(row.id)
    expect(deleted).toBeUndefined()
  })

  it('returns 401 for an expired token', async () => {
    const id = crypto.randomUUID()
    const past = Date.now() - 1000 * 60 * 60 // 1 hour ago
    db.prepare('INSERT INTO auth_tokens (id, email, otp, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(id, 'test@example.com', '123456', past, Date.now())

    const res = await request(app).get(`/auth/verify?token=${id}`)
    expect(res.status).toBe(401)
  })

  it('returns 401 for an invalid token', async () => {
    const res = await request(app).get('/auth/verify?token=nonexistent-token')
    expect(res.status).toBe(401)
  })
})

describe('GET /auth/me', () => {
  it('returns 200 with email for a valid JWT', async () => {
    const { signToken } = await import('../jwt')
    const jwt = signToken('me@example.com')

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('me@example.com')
  })

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
  })
})
