import express, { Request, Response, NextFunction } from 'express'
import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import { getServerDb } from './db'
import { sendMagicLink } from './email'
import { signToken, verifyToken } from './jwt'
import { estimateCost } from './cost'

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

export function createApp(db: Database.Database) {
  const app = express()
  app.use(express.json())

  // POST /auth/request
  app.post('/auth/request', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string }
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' })
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

  // POST /inference
  app.post('/inference', requireAuth, async (req: Request, res: Response) => {
    const { feature = 'unknown', model = 'claude-sonnet-4-6', messages = [] } = req.body as {
      feature?: string
      model?: string
      messages?: unknown[]
    }

    // Stub: record the request and return a placeholder response
    // Real Anthropic proxy will be implemented in PEO-118
    const inputTokens = JSON.stringify(messages).length / 4 | 0
    const outputTokens = 100
    const costUsd = estimateCost(model, inputTokens, outputTokens)

    db.prepare(
      'INSERT INTO inference_log (id, feature, model, input_tokens, output_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(ulid(), feature, model, inputTokens, outputTokens, costUsd, Date.now())

    res.json({ message: 'Inference stub — full proxy in PEO-118', model, inputTokens, outputTokens })
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

