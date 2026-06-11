import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../index'
import { getServerDb } from '../db'
import Database from 'better-sqlite3'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

let db: Database.Database
let dbPath: string

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-ink-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
})

afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
})

const samplePoints = [
  { x: 0, y: 0, pressure: 0.5 },
  { x: 10, y: 5, pressure: 0.6 },
  { x: 20, y: 10, pressure: 0.4 },
]

// ── GET /ink/strokes ─────────────────────────────────────────────────────────

describe('GET /ink/strokes', () => {
  it('returns empty array when no strokes', async () => {
    const app = createApp(db)
    const res = await request(app).get('/ink/strokes')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns stored strokes', async () => {
    db.prepare(
      'INSERT INTO ink_strokes (id, points, color, width, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('stroke-1', JSON.stringify(samplePoints), '#1a1a1a', 3, Date.now())

    const app = createApp(db)
    const res = await request(app).get('/ink/strokes')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('stroke-1')
    expect(res.body[0].points).toEqual(samplePoints)
    expect(res.body[0].color).toBe('#1a1a1a')
    expect(res.body[0].width).toBe(3)
  })

  it('returns multiple strokes in insertion order', async () => {
    const now = Date.now()
    db.prepare(
      'INSERT INTO ink_strokes (id, points, color, width, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('stroke-a', JSON.stringify(samplePoints), '#1a1a1a', 3, now)
    db.prepare(
      'INSERT INTO ink_strokes (id, points, color, width, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('stroke-b', JSON.stringify(samplePoints), '#1a1a1a', 3, now + 1)

    const app = createApp(db)
    const res = await request(app).get('/ink/strokes')
    expect(res.status).toBe(200)
    expect(res.body.map((s: { id: string }) => s.id)).toEqual(['stroke-a', 'stroke-b'])
  })
})

// ── POST /ink/strokes ────────────────────────────────────────────────────────

describe('POST /ink/strokes', () => {
  it('persists a stroke', async () => {
    const app = createApp(db)
    const res = await request(app).post('/ink/strokes').send({
      id: 'stroke-1',
      points: samplePoints,
      color: '#1a1a1a',
      width: 3,
    })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ ok: true })

    const row = db.prepare('SELECT * FROM ink_strokes WHERE id = ?').get('stroke-1') as {
      id: string; points: string; color: string; width: number
    }
    expect(row).toBeTruthy()
    expect(row.id).toBe('stroke-1')
    expect(JSON.parse(row.points)).toEqual(samplePoints)
  })

  it('upserts when same id posted twice', async () => {
    const app = createApp(db)
    await request(app).post('/ink/strokes').send({
      id: 'stroke-dup',
      points: samplePoints,
      color: '#000',
      width: 2,
    })
    await request(app).post('/ink/strokes').send({
      id: 'stroke-dup',
      points: [{ x: 1, y: 1, pressure: 0.5 }],
      color: '#fff',
      width: 5,
    })
    const count = (db.prepare('SELECT COUNT(*) as c FROM ink_strokes WHERE id = ?').get('stroke-dup') as { c: number }).c
    expect(count).toBe(1)
  })

  it('returns 400 when missing fields', async () => {
    const app = createApp(db)
    const res = await request(app).post('/ink/strokes').send({ id: 'stroke-x' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when points is not an array', async () => {
    const app = createApp(db)
    const res = await request(app).post('/ink/strokes').send({
      id: 'stroke-y',
      points: 'not-an-array',
      color: '#000',
      width: 3,
    })
    expect(res.status).toBe(400)
  })
})

// ── DELETE /ink/strokes/:id ──────────────────────────────────────────────────

describe('DELETE /ink/strokes/:id', () => {
  it('removes an existing stroke', async () => {
    db.prepare(
      'INSERT INTO ink_strokes (id, points, color, width, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run('del-1', JSON.stringify(samplePoints), '#1a1a1a', 3, Date.now())

    const app = createApp(db)
    const res = await request(app).delete('/ink/strokes/del-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })

    const row = db.prepare('SELECT id FROM ink_strokes WHERE id = ?').get('del-1')
    expect(row).toBeUndefined()
  })

  it('returns 404 for unknown stroke', async () => {
    const app = createApp(db)
    const res = await request(app).delete('/ink/strokes/nonexistent')
    expect(res.status).toBe(404)
  })
})
