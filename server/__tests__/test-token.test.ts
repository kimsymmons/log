import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../index'
import { getServerDb } from '../db'
import { verifyToken } from '../jwt'
import Database from 'better-sqlite3'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

let app: ReturnType<typeof createApp>
let db: Database.Database
let dbPath: string

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-token-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  app = createApp(db)
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  delete process.env.TEST_BYPASS_TOKEN
})

describe('POST /auth/test-token — bypass for the visual harness', () => {
  it('404s when TEST_BYPASS_TOKEN is not configured', async () => {
    delete process.env.TEST_BYPASS_TOKEN
    const res = await request(app).post('/auth/test-token').set('X-Test-Token', 'anything')
    expect(res.status).toBe(404)
  })

  it('401s when the X-Test-Token header does not match', async () => {
    process.env.TEST_BYPASS_TOKEN = 'secret-bypass'
    const res = await request(app).post('/auth/test-token').set('X-Test-Token', 'wrong')
    expect(res.status).toBe(401)
  })

  it('issues a valid JWT for test@log.local when the header matches', async () => {
    process.env.TEST_BYPASS_TOKEN = 'secret-bypass'
    const res = await request(app).post('/auth/test-token').set('X-Test-Token', 'secret-bypass')
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(verifyToken(res.body.token)).toEqual({ email: 'test@log.local' })
  })
})
