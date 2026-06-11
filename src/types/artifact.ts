// ── Domain model types (PEO-111 / PEO-115) ──────────────────────────────────

export type ArtifactType = 'chat' | 'project' | 'note' | 'sketch'

export type LinkProvenance = 'model-drawn' | 'user-pinned' | 'user-made' | 'dismissed'

export interface Artifact {
  id: string
  type: ArtifactType
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

export type NewArtifact = Omit<Artifact, 'id' | 'created_at' | 'updated_at' | 'synced_at'>

export interface ArtifactLink {
  id: string
  source_id: string
  target_id: string
  strength: number
  link_type: string | null
  tags: string | null
  provenance: LinkProvenance
  confidence: number
  created_at: number
}

export type NewArtifactLink = Omit<ArtifactLink, 'id' | 'created_at' | 'provenance' | 'confidence'> & {
  provenance?: LinkProvenance
  confidence?: number
}

export interface MemoryEntry {
  id: string
  artifact_id: string
  embedding_model: string | null
  content: string | null
  embedding: Buffer | null
  created_at: number
}

export type NewMemoryEntry = Omit<MemoryEntry, 'id' | 'created_at'>

// ── Canvas artifact shape types (PEO-119) ────────────────────────────────────

/** Type discriminator for the three tldraw artifact shapes on the canvas. */
export type ArtifactShapeType = 'markdown' | 'code' | 'image'

/** Payload emitted in an SSE summary event when the model produces
 *  a standalone artifact alongside the conversation summary. */
export type ArtifactSsePayload = {
  type: ArtifactShapeType
  title: string
  content: string
}
