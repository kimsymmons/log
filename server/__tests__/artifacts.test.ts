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
  dbPath = path.join(os.tmpdir(), `test-artifacts-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  app = createApp(db)
  authToken = signToken('test@example.com')
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

const seed = async () => {
  await request(app)
    .post('/import/chats')
    .set('Authorization', `Bearer ${authToken}`)
    .send([
      { type: 'chat', title: 'Chat A', content: '[]', created_at: 1700000000000 },
      { type: 'chat', title: 'Chat B', content: '[]', created_at: 1700000001000 },
      { type: 'note', title: 'A note', content: 'x', created_at: 1700000002000 },
    ])
}

describe('GET /artifacts', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/artifacts')
    expect(res.status).toBe(401)
  })

  it('lists all artifacts ordered by created_at', async () => {
    await seed()
    const res = await request(app).get('/artifacts').set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(3)
    expect(res.body.map((r: { title: string }) => r.title)).toEqual(['Chat A', 'Chat B', 'A note'])
  })

  it('filters by type=chat', async () => {
    await seed()
    const res = await request(app)
      .get('/artifacts?type=chat')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body.every((r: { type: string }) => r.type === 'chat')).toBe(true)
    expect(res.body[0]).toHaveProperty('content')
  })

  it('returns an empty array when nothing matches', async () => {
    const res = await request(app)
      .get('/artifacts?type=chat')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('round-trips sourceUrl through import and listing', async () => {
    await request(app)
      .post('/import/chats')
      .set('Authorization', `Bearer ${authToken}`)
      .send([
        { type: 'chat', title: 'With URL', content: '[]', sourceUrl: 'https://claude.ai/chat/abc-123', created_at: 1700000000000 },
        { type: 'chat', title: 'No URL', content: '[]', created_at: 1700000001000 },
      ])
    const res = await request(app)
      .get('/artifacts?type=chat')
      .set('Authorization', `Bearer ${authToken}`)
    const byTitle = Object.fromEntries(
      (res.body as Array<{ title: string; sourceUrl: string | null }>).map((r) => [r.title, r.sourceUrl]),
    )
    expect(byTitle['With URL']).toBe('https://claude.ai/chat/abc-123')
    expect(byTitle['No URL']).toBeNull()
  })
})
