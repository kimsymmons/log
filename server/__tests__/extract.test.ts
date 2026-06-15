import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp, type AnthropicLike } from '../index'
import { getServerDb } from '../db'
import { signToken } from '../jwt'
import Database from 'better-sqlite3'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'

vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null })
  class MockResend { emails = { send: mockSend } }
  return { Resend: MockResend }
})

const jsonResp = (obj: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(obj) }],
  usage: { input_tokens: 120, output_tokens: 40 },
})

// Mock haiku: the "Garden" thread is a project idea; "Japan" is not.
function mockAnthropic(): AnthropicLike {
  return {
    messages: {
      stream: () => { throw new Error('not used') },
      create: vi.fn(async (params: { messages: Array<{ content: string }> }) => {
        const msg = params.messages[0].content
        if (msg.includes('Garden')) {
          return jsonResp({
            isProjectIdea: true,
            ideaTitle: 'Automated garden irrigation',
            ideaDescription: 'An IoT system that waters the garden automatically.',
            tags: ['irrigation', 'garden', 'Sensors', 'auto-process'], // mixed-format on purpose
          })
        }
        return jsonResp({ isProjectIdea: false, ideaTitle: '', ideaDescription: '', tags: ['japan', 'Rates', 'trip'] })
      }),
    },
  } as unknown as AnthropicLike
}

let db: Database.Database
let dbPath: string
let token: string

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok!'
  dbPath = path.join(os.tmpdir(), `test-extract-${Date.now()}-${Math.random()}.db`)
  db = getServerDb(dbPath)
  token = signToken('test@example.com')
})
afterEach(() => {
  db.close()
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  vi.clearAllMocks()
})

async function seed(app: ReturnType<typeof createApp>) {
  await request(app).post('/import/chats').set('Authorization', `Bearer ${token}`).send([
    { type: 'chat', title: 'Garden watering system', content: '[{"role":"user","content":"I want to build a garden waterer with sensors"}]', created_at: 1 },
    { type: 'chat', title: 'Japan trip', content: '[{"role":"user","content":"planning a trip to japan"}]', created_at: 2 },
  ])
}

describe('POST /extract/ideas', () => {
  it('requires auth', async () => {
    const res = await request(createApp(db, mockAnthropic())).post('/extract/ideas')
    expect(res.status).toBe(401)
  })

  it('creates an Idea artifact for the project-idea thread, linked via sourceThreadId', async () => {
    const app = createApp(db, mockAnthropic())
    await seed(app)
    const res = await request(app).post('/extract/ideas').set('Authorization', `Bearer ${token}`)
    expect(res.body).toEqual({ processed: 2, ideasCreated: 1 })

    const ideas = (await request(app).get('/artifacts?type=idea').set('Authorization', `Bearer ${token}`)).body as Array<{ id: string; title: string; content: string; tags: string }>
    expect(ideas).toHaveLength(1)
    const entity = JSON.parse(ideas[0].content)
    expect(entity.title).toBe('Automated garden irrigation')
    expect(entity.status).toBe('idea')
    expect(typeof entity.sourceThreadId).toBe('string')
    expect(entity.sourceThreadTitle).toBe('Garden watering system')
  })

  it('normalises haiku tags to single lowercase singular words', async () => {
    const app = createApp(db, mockAnthropic())
    await seed(app)
    await request(app).post('/extract/ideas').set('Authorization', `Bearer ${token}`)
    const chats = (await request(app).get('/artifacts?type=chat').set('Authorization', `Bearer ${token}`)).body as Array<{ title: string; tags: string | null }>
    const byTitle = Object.fromEntries(chats.map((c) => [c.title, JSON.parse(c.tags ?? 'null')]))
    expect(byTitle['Garden watering system']).toEqual(['irrigation', 'garden', 'sensor', 'auto']) // Sensors→sensor, auto-process→auto
    expect(byTitle['Japan trip']).toEqual(['japan', 'rate', 'trip']) // Rates→rate
  })

  it('is idempotent — re-running upserts the idea, no duplicates', async () => {
    const app = createApp(db, mockAnthropic())
    await seed(app)
    await request(app).post('/extract/ideas').set('Authorization', `Bearer ${token}`)
    await request(app).post('/extract/ideas').set('Authorization', `Bearer ${token}`)
    const ideas = (await request(app).get('/artifacts?type=idea').set('Authorization', `Bearer ${token}`)).body as unknown[]
    expect(ideas).toHaveLength(1)
  })

  it('skips threads whose model output is unparseable', async () => {
    const bad: AnthropicLike = {
      messages: {
        stream: () => { throw new Error('nope') },
        create: vi.fn(async () => ({ content: [{ type: 'text', text: 'not json at all' }], usage: { input_tokens: 1, output_tokens: 1 } })),
      },
    } as unknown as AnthropicLike
    const app = createApp(db, bad)
    await seed(app)
    const res = await request(app).post('/extract/ideas').set('Authorization', `Bearer ${token}`)
    expect(res.body).toEqual({ processed: 0, ideasCreated: 0 })
  })
})
