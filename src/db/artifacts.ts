import { ulid } from 'ulid'
import type Database from 'better-sqlite3'
import type { Artifact, ArtifactType, NewArtifact } from '../types/artifact'

type ArtifactRow = {
  id: string
  type: string
  title: string | null
  content: string | null
  canvas_x: number | null
  canvas_y: number | null
  canvas_w: number | null
  canvas_h: number | null
  created_at: number
  updated_at: number
  synced_at: number | null
}

function rowToArtifact(row: ArtifactRow): Artifact {
  return row as Artifact
}

export function insertArtifact(db: Database.Database, artifact: NewArtifact): Artifact {
  const id = ulid()
  const now = Date.now()
  const row = db.prepare<unknown[], ArtifactRow>(`
    INSERT INTO artifacts (id, type, title, content, canvas_x, canvas_y, canvas_w, canvas_h, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    RETURNING *
  `).get(id, artifact.type, artifact.title ?? null, artifact.content ?? null, artifact.canvas_x ?? null, artifact.canvas_y ?? null, artifact.canvas_w ?? null, artifact.canvas_h ?? null, now, now)

  return rowToArtifact(row!)
}

export function getArtifact(db: Database.Database, id: string): Artifact | null {
  const row = db.prepare<[string], ArtifactRow>('SELECT * FROM artifacts WHERE id = ?').get(id)
  return row ? rowToArtifact(row) : null
}

export function updateArtifact(db: Database.Database, id: string, patch: Partial<Artifact>): Artifact {
  const now = Date.now()
  const fields = { ...patch, updated_at: now }
  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(fields), id]

  const row = db.prepare<unknown[], ArtifactRow>(
    `UPDATE artifacts SET ${setClauses} WHERE id = ? RETURNING *`
  ).get(...values)

  return rowToArtifact(row!)
}

export function listArtifactsByType(db: Database.Database, type: ArtifactType): Artifact[] {
  return db.prepare<[string], ArtifactRow>('SELECT * FROM artifacts WHERE type = ?').all(type).map(rowToArtifact)
}
