import { ulid } from 'ulid'
import type Database from 'better-sqlite3'
import type { ArtifactLink, NewArtifactLink } from '../types/artifact'

type LinkRow = {
  id: string
  source_id: string
  target_id: string
  strength: number
  link_type: string | null
  tags: string | null
  provenance: string
  confidence: number
  created_at: number
}

export function insertLink(db: Database.Database, link: NewArtifactLink): ArtifactLink {
  const id = ulid()
  const now = Date.now()
  const provenance = link.provenance ?? 'user-made'
  const confidence = link.confidence ?? 1.0
  const row = db.prepare<unknown[], LinkRow>(`
    INSERT INTO artifact_links (id, source_id, target_id, strength, link_type, tags, provenance, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(id, link.source_id, link.target_id, link.strength, link.link_type ?? null, link.tags ?? null, provenance, confidence, now)

  return row as ArtifactLink
}

export function getLinksForArtifact(db: Database.Database, artifactId: string, minStrength?: number): ArtifactLink[] {
  if (minStrength !== undefined) {
    return db.prepare<[string, number], LinkRow>(
      'SELECT * FROM artifact_links WHERE source_id = ? AND strength >= ? ORDER BY confidence DESC'
    ).all(artifactId, minStrength) as ArtifactLink[]
  }
  return db.prepare<[string], LinkRow>(
    'SELECT * FROM artifact_links WHERE source_id = ? ORDER BY confidence DESC'
  ).all(artifactId) as ArtifactLink[]
}
