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

let app: ReturnType<typeof createApp>
let db: Database.Database
let dbPath: string
let authToken: string

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-import-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  app = createApp(db)
  authToken = signToken('test@example.com')
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

describe('POST /import/chats — auth', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/import/chats').send([])
    expect(res.status).toBe(401)
  })
})

describe('POST /import/chats — insertion', () => {
  const artifacts = [
    { type: 'chat', title: 'Chat A', content: 'First chat', created_at: 1700000000000 },
    { type: 'chat', title: 'Chat B', content: 'Second chat', created_at: 1700000001000 },
  ]

  it('returns 200 with count of inserted rows', async () => {
    const res = await request(app)
      .post('/import/chats')
      .set('Authorization', `Bearer ${authToken}`)
      .send(artifacts)
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
  })

  it('inserts rows into the artifacts table', async () => {
    await request(app)
      .post('/import/chats')
      .set('Authorization', `Bearer ${authToken}`)
      .send(artifacts)

    const rows = db.prepare('SELECT * FROM artifacts WHERE type = ?').all('chat') as Array<{
      title: string; content: string; created_at: number
    }>
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.title).sort()).toEqual(['Chat A', 'Chat B'])
  })

  it('returns count: 0 for empty array', async () => {
    const res = await request(app)
      .post('/import/chats')
      .set('Authorization', `Bearer ${authToken}`)
      .send([])
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(0)
  })

  it('returns 400 for non-array body', async () => {
    const res = await request(app)
      .post('/import/chats')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'not an array' })
    expect(res.status).toBe(400)
  })

  it('skips items missing title', async () => {
    const res = await request(app)
      .post('/import/chats')
      .set('Authorization', `Bearer ${authToken}`)
      .send([{ type: 'chat', content: 'no title', created_at: 0 }])
    expect(res.body.count).toBe(0)
  })
})
