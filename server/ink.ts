import { Router, Request, Response } from 'express'
import Database from 'better-sqlite3'

interface InkStrokeRow {
  id: string
  points: string
  color: string
  width: number
  created_at: number
}

export function inkRouter(db: Database.Database): Router {
  const router = Router()

  router.get('/strokes', (_req: Request, res: Response) => {
    const rows = db.prepare('SELECT * FROM ink_strokes ORDER BY created_at ASC').all() as InkStrokeRow[]
    res.json(rows.map(r => ({
      id: r.id,
      points: JSON.parse(r.points) as unknown,
      color: r.color,
      width: r.width,
      canvasX: 0,
      canvasY: 0,
      zoom: 1,
    })))
  })

  router.post('/strokes', (req: Request, res: Response) => {
    const { id, points, color, width } = req.body as {
      id?: string
      points?: unknown
      color?: string
      width?: number
    }
    if (!id || typeof id !== 'string' || !Array.isArray(points) || !color || typeof color !== 'string' || typeof width !== 'number') {
      res.status(400).json({ error: 'id, points (array), color, and width are required' })
      return
    }
    db.prepare(
      'INSERT OR REPLACE INTO ink_strokes (id, points, color, width, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, JSON.stringify(points), color, width, Date.now())
    res.status(201).json({ ok: true })
  })

  router.delete('/strokes/:id', (req: Request, res: Response) => {
    const { id } = req.params
    const existing = db.prepare('SELECT id FROM ink_strokes WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'stroke not found' })
      return
    }
    db.prepare('DELETE FROM ink_strokes WHERE id = ?').run(id)
    res.json({ ok: true })
  })

  return router
}
