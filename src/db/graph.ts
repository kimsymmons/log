import type Database from 'better-sqlite3'
import type { Artifact, ArtifactLink } from '../types/artifact'

export interface GraphExport {
  version: 1
  exportedAt: string
  artifacts: Artifact[]
  links: ArtifactLink[]
}

export function exportGraph(db: Database.Database): GraphExport {
  const artifacts = db.prepare('SELECT * FROM artifacts').all() as Artifact[]
  const links = db.prepare('SELECT * FROM artifact_links').all() as ArtifactLink[]
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    artifacts,
    links,
  }
}

export function restoreGraph(db: Database.Database, data: GraphExport): void {
  db.transaction(() => {
    db.prepare('DELETE FROM artifact_links').run()
    db.prepare('DELETE FROM memory_entries').run()
    db.prepare('DELETE FROM artifacts').run()

    const insertArtifact = db.prepare(`
      INSERT INTO artifacts (id, type, title, content, canvas_x, canvas_y, canvas_w, canvas_h, created_at, updated_at, synced_at)
      VALUES (@id, @type, @title, @content, @canvas_x, @canvas_y, @canvas_w, @canvas_h, @created_at, @updated_at, @synced_at)
    `)
    for (const artifact of data.artifacts) {
      insertArtifact.run(artifact)
    }

    const insertLink = db.prepare(`
      INSERT INTO artifact_links (id, source_id, target_id, strength, link_type, tags, provenance, confidence, created_at)
      VALUES (@id, @source_id, @target_id, @strength, @link_type, @tags, @provenance, @confidence, @created_at)
    `)
    for (const link of data.links) {
      insertLink.run(link)
    }
  })()
}
