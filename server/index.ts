import cors from 'cors'
import express, { Request, Response, NextFunction } from 'express'
import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import Anthropic from '@anthropic-ai/sdk'
import type { MessageStreamEvent, RawContentBlockDeltaEvent, TextDelta } from '@anthropic-ai/sdk/resources/messages'
import { getServerDb } from './db'
import { sendMagicLink } from './email'
import { signToken, verifyToken } from './jwt'
import { estimateCost } from './cost'
import { findLinks, LINKING_MODEL } from './linking'
import { suggestClusters } from './clustering'
import { inkRouter } from './ink'

interface AuthToken {
  id: string
  email: string
  otp: string
  expires_at: number
  created_at: number
}

interface InferenceRow {
  feature: string
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  ;(req as Request & { user: { email: string } }).user = payload
  next()
}

// Minimal interface so tests can inject a mock without importing the real SDK
export type AnthropicLike = {
  messages: {
    stream(params: object): AsyncIterable<unknown> & {
      finalMessage(): Promise<{ usage: { input_tokens: number; output_tokens: number } }>
    }
    create(params: object): Promise<{
      content: Array<{ type: string; text?: string }>
      usage?: { input_tokens: number; output_tokens: number }
    }>
  }
}

// ── Idea extraction (haiku) ───────────────────────────────────────────────────

const EXTRACT_MODEL = 'claude-haiku-4-5-20251001'
const EXTRACT_SYSTEM = `You analyse a single chat conversation and return STRICT JSON (no prose, no markdown) shaped:
{"isProjectIdea": boolean, "ideaTitle": string, "ideaDescription": string, "tags": string[]}

- isProjectIdea: true ONLY if the conversation is about building/making a specific tool, app, system, or project. False for general Q&A, advice, trip planning, or learning a topic.
- ideaTitle: short noun phrase naming the idea (e.g. "Automated garden irrigation"). "" when isProjectIdea is false.
- ideaDescription: 1-2 sentences. "" when isProjectIdea is false.
- tags: ALWAYS 2-4 topic tags describing the conversation's subject, even when isProjectIdea is false (e.g. a Japan trip → ["japan","travel","itinerary"]; mortgages → ["mortgage","finance","interest"]). EACH tag MUST be a single lowercase English word, singular — no plurals, no contractions, no hyphens, no spaces, no digits. Good: ["irrigation","garden","sensor"]. Bad: ["auto-process","rates","i-m"].

Return ONLY the JSON object.`

interface ExtractResult {
  isProjectIdea?: boolean
  ideaTitle?: string
  ideaDescription?: string
  tags?: unknown[]
}

/** Flatten a stored chat (JSON message array) to plain text for the prompt. */
function flattenThread(content: string | null): string {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed
        .map((m: { role?: string; content?: string }) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content ?? ''}`)
        .join('\n')
    }
  } catch { /* not a messages array — fall through */ }
  return content
}

/** Tolerate ```json … ``` fences around the model's JSON. */
function stripFences(text: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text)
  return (m ? m[1] : text).trim()
}

/** Coerce an LLM tag to the canonical format: single lowercase singular word. */
function normalizeServerTag(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const word = (raw.toLowerCase().match(/[a-z]+/g) ?? [])[0] ?? ''
  if (word.length < 3) return ''
  if (word.length > 4) {
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
    // Leave non-plural -s words alone (canvas, status, atlas, chaos).
    if (!/(ss|us|is|os|as)$/.test(word) && word.endsWith('s')) return word.slice(0, -1)
  }
  return word
}

const AUTH_RATE_WINDOW_MS = 60_000
const AUTH_RATE_LIMIT = 5

// Per-email request timestamps within the sliding window (exported for test reset)
export const authRateMap = new Map<string, number[]>()

function isRateLimited(email: string): boolean {
  const now = Date.now()
  const timestamps = (authRateMap.get(email) ?? []).filter(t => now - t < AUTH_RATE_WINDOW_MS)
  if (timestamps.length >= AUTH_RATE_LIMIT) return true
  timestamps.push(now)
  authRateMap.set(email, timestamps)
  return false
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174']

export function createApp(db: Database.Database, anthropicOverride?: AnthropicLike) {
  const app = express()
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
        return callback(null, true)
      }
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }))
  app.use(express.json())

  // Ink strokes (PEO-126) — no auth required (local-first)
  app.use('/ink', inkRouter(db))

  // POST /auth/request
  app.post('/auth/request', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string }
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' })
      return
    }

    if (isRateLimited(email)) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }

    const id = ulid()
    const otp = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = Date.now() + 15 * 60 * 1000
    const createdAt = Date.now()

    db.prepare(
      'INSERT INTO auth_tokens (id, email, otp, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, otp, expiresAt, createdAt)

    try {
      await sendMagicLink(email, id)
    } catch (err) {
      // Don't leak email errors; token is stored regardless
      console.error('Email send failed:', err)
    }

    res.json({ message: 'Check your email for a sign-in link.' })
  })

  // GET /auth/verify
  app.get('/auth/verify', (req: Request, res: Response) => {
    const { token } = req.query as { token?: string }
    if (!token) {
      res.status(400).json({ error: 'token is required' })
      return
    }

    const row = db.prepare('SELECT * FROM auth_tokens WHERE id = ?').get(token) as AuthToken | undefined
    if (!row) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    if (row.expires_at < Date.now()) {
      db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(token)
      res.status(401).json({ error: 'Token expired' })
      return
    }

    db.prepare('DELETE FROM auth_tokens WHERE id = ?').run(token)
    const jwt = signToken(row.email)
    res.json({ token: jwt })
  })

  // GET /auth/me
  app.get('/auth/me', requireAuth, (req: Request, res: Response) => {
    const user = (req as Request & { user: { email: string } }).user
    res.json({ email: user.email })
  })

  // POST /auth/test-token — test-only auth bypass for the Playwright visual harness.
  // Disabled unless TEST_BYPASS_TOKEN is set; requires a matching X-Test-Token header.
  // Issues a real JWT for a fixed test identity so E2E specs can seed localStorage.auth_token.
  app.post('/auth/test-token', (req: Request, res: Response) => {
    const expected = process.env.TEST_BYPASS_TOKEN
    if (!expected) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (req.headers['x-test-token'] !== expected) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json({ token: signToken('test@log.local') })
  })

  // POST /auth/dev-token — frictionless local-dev auth. Mints a JWT for a fixed
  // dev identity so `npm run dev` shows the canvas with no manual sign-in. Hard-
  // gated to NODE_ENV === 'development' (404 in production / any other env), and
  // the front end only calls it under import.meta.env.DEV.
  app.post('/auth/dev-token', (_req: Request, res: Response) => {
    if (process.env.NODE_ENV !== 'development') {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ token: signToken('dev@log.local') })
  })

  // POST /inference — SSE streaming proxy to Anthropic
  app.post('/inference', requireAuth, async (req: Request, res: Response) => {
    const {
      artifactId = 'unknown',
      modelId = 'claude-sonnet-4-6',
      messages = [],
    } = req.body as {
      artifactId?: string
      modelId?: string
      messages?: Array<{ role: string; content: string }>
      stream?: boolean
    }

    let anthropic: AnthropicLike
    if (anthropicOverride) {
      anthropic = anthropicOverride
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
        return
      }
      anthropic = new Anthropic({ apiKey })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    let accumulatedContent = ''
    let inputTokens = 0
    let outputTokens = 0

    try {
      const streamResp = anthropic.messages.stream({
        model: modelId,
        max_tokens: 1024,
        messages: messages as Array<{ role: 'user' | 'assistant'; content: string }>,
      })

      for await (const event of streamResp) {
        const streamEvent = event as MessageStreamEvent
        if (
          streamEvent.type === 'content_block_delta' &&
          (streamEvent as RawContentBlockDeltaEvent).delta.type === 'text_delta'
        ) {
          const textDelta = (streamEvent as RawContentBlockDeltaEvent).delta as TextDelta
          const text = textDelta.text
          accumulatedContent += text
          res.write(`data: ${JSON.stringify({ delta: text })}\n\n`)
        }
      }

      const finalMsg = await streamResp.finalMessage()
      inputTokens = finalMsg.usage.input_tokens
      outputTokens = finalMsg.usage.output_tokens

      // Auto-summary via haiku
      let summaryTitle = artifactId
      let summaryBody = ''
      try {
        const summaryResp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [
            ...(messages as Array<{ role: 'user' | 'assistant'; content: string }>),
            { role: 'assistant', content: accumulatedContent },
            {
              role: 'user',
              content:
                'Summarise this conversation as JSON only: {"title":"short title","body":"one sentence"}. No markdown, no other text.',
            },
          ],
        })
        inputTokens += summaryResp.usage?.input_tokens ?? 0
        outputTokens += summaryResp.usage?.output_tokens ?? 0
        const contentBlock = summaryResp.content[0]
        let raw: string
        if (contentBlock && contentBlock.type === 'text') {
          raw = (contentBlock as { text: string }).text
        } else {
          raw = ''
        }
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        const parsed = JSON.parse(jsonStr) as { title?: string; body?: string }
        summaryTitle = parsed.title ?? summaryTitle
        summaryBody = parsed.body ?? ''
      } catch {
        summaryBody = accumulatedContent.slice(0, 120)
      }

      res.write(`data: ${JSON.stringify({ summary: { title: summaryTitle, body: summaryBody } })}\n\n`)
      res.write('data: [DONE]\n\n')
    } catch (err) {
      const msg = (err as Error).message ?? 'Inference failed'
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
      res.write('data: [DONE]\n\n')
    } finally {
      try {
        const costUsd = estimateCost(modelId, inputTokens, outputTokens)
        db.prepare(
          'INSERT INTO inference_log (id, feature, model, input_tokens, output_tokens, cost_usd, artifact_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(ulid(), artifactId, modelId, inputTokens, outputTokens, costUsd, artifactId, Date.now())
      } catch {
        // don't fail the response if logging throws
      }
      res.end()
    }
  })

  // POST /import/chats — bulk-insert conversations as artifacts
  app.post('/import/chats', requireAuth, (req: Request, res: Response) => {
    const body = req.body
    if (!Array.isArray(body)) {
      res.status(400).json({ error: 'body must be an array' })
      return
    }

    const insert = db.prepare(
      'INSERT INTO artifacts (id, type, title, content, sourceUrl, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )

    let count = 0
    const now = Date.now()
    for (const item of body as Array<Record<string, unknown>>) {
      if (!item.title || typeof item.title !== 'string') continue
      insert.run(
        ulid(),
        typeof item.type === 'string' ? item.type : 'chat',
        item.title,
        typeof item.content === 'string' ? item.content : '',
        typeof item.sourceUrl === 'string' ? item.sourceUrl : null,
        typeof item.created_at === 'number' ? item.created_at : now,
        now
      )
      count++
    }

    res.json({ count })
  })

  // POST /extract/ideas — haiku reads each chat thread, assigns 2-4 semantic
  // tags, and when the thread describes a project idea creates an Idea artifact
  // (type='idea') linked back via sourceThreadId. Re-running upserts (no dupes).
  app.post('/extract/ideas', requireAuth, async (_req: Request, res: Response) => {
    let anthropic: AnthropicLike
    if (anthropicOverride) {
      anthropic = anthropicOverride
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
        return
      }
      anthropic = new Anthropic({ apiKey }) as unknown as AnthropicLike
    }

    const threads = db
      .prepare("SELECT id, title, content FROM artifacts WHERE type = 'chat' ORDER BY created_at ASC")
      .all() as Array<{ id: string; title: string; content: string | null }>

    const setTags = db.prepare('UPDATE artifacts SET tags = ?, updated_at = ? WHERE id = ?')
    const upsertIdea = db.prepare(
      `INSERT INTO artifacts (id, type, title, content, sourceUrl, tags, created_at, updated_at)
       VALUES (?, 'idea', ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, tags=excluded.tags, updated_at=excluded.updated_at`
    )

    let processed = 0
    let ideasCreated = 0
    for (const t of threads) {
      let parsed: ExtractResult
      try {
        const resp = await anthropic.messages.create({
          model: EXTRACT_MODEL,
          max_tokens: 400,
          system: EXTRACT_SYSTEM,
          messages: [{ role: 'user', content: `Title: ${t.title}\n\nConversation:\n${flattenThread(t.content)}` }],
        })
        const text = resp.content.map((c) => c.text ?? '').join('').trim()
        parsed = JSON.parse(stripFences(text)) as ExtractResult
        try {
          const inT = resp.usage?.input_tokens ?? 0
          const outT = resp.usage?.output_tokens ?? 0
          db.prepare(
            'INSERT INTO inference_log (id, feature, model, input_tokens, output_tokens, cost_usd, artifact_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(ulid(), 'extraction', EXTRACT_MODEL, inT, outT, estimateCost(EXTRACT_MODEL, inT, outT), t.id, Date.now())
        } catch { /* logging is non-fatal */ }
      } catch {
        continue // skip threads whose inference errors or returns unparseable JSON
      }
      processed++

      const tags = Array.isArray(parsed.tags)
        ? [...new Set(parsed.tags.map(normalizeServerTag).filter(Boolean))].slice(0, 4)
        : []
      const now = Date.now()
      if (tags.length) setTags.run(JSON.stringify(tags), now, t.id)

      if (parsed.isProjectIdea && typeof parsed.ideaTitle === 'string' && parsed.ideaTitle.trim()) {
        const ideaId = `idea-${t.id}`
        const entity = {
          id: ideaId,
          type: 'idea',
          title: parsed.ideaTitle.trim(),
          description: typeof parsed.ideaDescription === 'string' ? parsed.ideaDescription.trim() : '',
          sourceThreadId: t.id,
          sourceThreadTitle: t.title,
          tags,
          status: 'idea',
          extractedAt: new Date(now).toISOString(),
        }
        upsertIdea.run(ideaId, entity.title, JSON.stringify(entity), JSON.stringify(tags), now, now)
        ideasCreated++
      }
    }

    res.json({ processed, ideasCreated })
  })

  // GET /artifacts — list stored artifacts, optionally filtered by ?type=chat.
  // Used by the canvas to load existing chat threads as Thread cards on mount.
  app.get('/artifacts', requireAuth, (req: Request, res: Response) => {
    const { type } = req.query as { type?: string }
    const rows = typeof type === 'string' && type
      ? db.prepare(
          `SELECT id, type, title, content, sourceUrl, tags, created_at, updated_at
           FROM artifacts WHERE type = ? ORDER BY created_at ASC`
        ).all(type)
      : db.prepare(
          `SELECT id, type, title, content, sourceUrl, tags, created_at, updated_at
           FROM artifacts ORDER BY created_at ASC`
        ).all()
    res.json(rows)
  })

  // POST /linking/run — model-drawn links for one artifact (PEO-122)
  app.post('/linking/run', requireAuth, async (req: Request, res: Response) => {
    const { artifactId } = req.body as { artifactId?: string }
    if (!artifactId || typeof artifactId !== 'string') {
      res.status(400).json({ error: 'artifactId is required' })
      return
    }

    let anthropic: AnthropicLike
    if (anthropicOverride) {
      anthropic = anthropicOverride
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
        return
      }
      anthropic = new Anthropic({ apiKey })
    }

    let inputTokens = 0
    let outputTokens = 0

    try {
      const result = await findLinks(db, artifactId, anthropic)
      inputTokens = result.inputTokens
      outputTokens = result.outputTokens

      const upsert = db.prepare(
        `INSERT INTO artifact_links (id, source_id, target_id, strength, link_type, provenance, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, 'model-drawn', ?, ?)
         ON CONFLICT(source_id, target_id) DO UPDATE SET
           strength = excluded.strength,
           link_type = excluded.link_type,
           provenance = excluded.provenance,
           confidence = excluded.confidence`
      )
      const now = Date.now()
      for (const link of result.links) {
        upsert.run(ulid(), artifactId, link.targetId, link.confidence, link.type, link.confidence, now)
      }

      res.json({ linked: result.links.length })
    } catch (err) {
      const msg = (err as Error).message ?? 'Linking failed'
      res.status(msg === 'artifact not found' ? 404 : 500).json({ error: msg })
    } finally {
      // Log actual spend only — skipped runs (no candidates / cost ceiling) make no API call
      if (inputTokens > 0 || outputTokens > 0) {
        try {
          const costUsd = estimateCost(LINKING_MODEL, inputTokens, outputTokens)
          db.prepare(
            'INSERT INTO inference_log (id, feature, model, input_tokens, output_tokens, cost_usd, artifact_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(ulid(), 'linking', LINKING_MODEL, inputTokens, outputTokens, costUsd, artifactId, Date.now())
        } catch {
          // don't fail the response if logging throws
        }
      }
    }
  })

  // GET /links?artifactId=... — non-dismissed links for an artifact (PEO-123)
  app.get('/links', requireAuth, (req: Request, res: Response) => {
    const { artifactId } = req.query as { artifactId?: string }
    if (!artifactId || typeof artifactId !== 'string') {
      res.status(400).json({ error: 'artifactId is required' })
      return
    }
    const rows = db.prepare(
      `SELECT id, source_id, target_id, strength, provenance, rationale, link_type, created_at
       FROM artifact_links
       WHERE (source_id = ? OR target_id = ?) AND provenance != 'dismissed'`
    ).all(artifactId, artifactId)
    res.json(rows)
  })

  const VALID_PROVENANCE = new Set(['user-pinned', 'user-made', 'model-drawn', 'dismissed'])

  // PATCH /links/:id — update provenance + log feedback (PEO-123)
  app.patch('/links/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params
    const { provenance } = req.body as { provenance?: string }
    if (!provenance || !VALID_PROVENANCE.has(provenance)) {
      res.status(400).json({ error: 'provenance must be one of: user-pinned, user-made, model-drawn, dismissed' })
      return
    }
    const existing = db.prepare('SELECT id FROM artifact_links WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'link not found' })
      return
    }
    db.prepare('UPDATE artifact_links SET provenance = ? WHERE id = ?').run(provenance, id)
    const action = provenance === 'dismissed' ? 'dismiss' : 'keep'
    db.prepare(
      'INSERT INTO link_feedback (id, link_id, action, created_at) VALUES (?, ?, ?, ?)'
    ).run(ulid(), id, action, Date.now())
    res.json({ ok: true })
  })

  // DELETE /links/:id — remove link + log feedback (PEO-123)
  app.delete('/links/:id', requireAuth, (req: Request, res: Response) => {
    const { id } = req.params
    const existing = db.prepare('SELECT id FROM artifact_links WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'link not found' })
      return
    }
    db.prepare('INSERT INTO link_feedback (id, link_id, action, created_at) VALUES (?, ?, ?, ?)').run(ulid(), id, 'remove', Date.now())
    db.prepare('DELETE FROM artifact_links WHERE id = ?').run(id)
    res.json({ ok: true })
  })

  // POST /clusters/suggest — return AI-suggested clusters (PEO-124)
  app.post('/clusters/suggest', requireAuth, async (req: Request, res: Response) => {
    let anthropic: AnthropicLike
    if (anthropicOverride) {
      anthropic = anthropicOverride
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
        return
      }
      anthropic = new Anthropic({ apiKey })
    }

    try {
      const clusters = await suggestClusters(db, anthropic)
      res.json(clusters)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message ?? 'Cluster suggestion failed' })
    }
  })

  // POST /clusters/apply — persist a cluster (PEO-124)
  app.post('/clusters/apply', requireAuth, (req: Request, res: Response) => {
    const { clusterId, label, artifactIds } = req.body as {
      clusterId?: string
      label?: string
      artifactIds?: string[]
    }
    if (!clusterId || typeof clusterId !== 'string' || !label || typeof label !== 'string' || !Array.isArray(artifactIds)) {
      res.status(400).json({ error: 'clusterId, label, and artifactIds are required' })
      return
    }
    db.prepare(
      'INSERT OR REPLACE INTO clusters (id, label, artifact_ids, created_at) VALUES (?, ?, ?, ?)'
    ).run(clusterId, label, JSON.stringify(artifactIds), Date.now())
    res.json({ ok: true })
  })

  // GET /cost/summary
  app.get('/cost/summary', requireAuth, (req: Request, res: Response) => {
    const rows = db.prepare(
      'SELECT feature, model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as cost_usd FROM inference_log GROUP BY feature, model'
    ).all() as InferenceRow[]

    const totalCost = rows.reduce((sum, r) => sum + r.cost_usd, 0)
    const totalTokens = rows.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0)

    res.json({ totalCost, totalTokens, byFeature: rows })
  })

  return app
}

