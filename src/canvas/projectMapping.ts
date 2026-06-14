import type { ProjectEntity, ProjectSource } from './entity-schema'

// Entity mapping layer — normalises projects from many sources into the single
// ProjectEntity schema (see entity-schema.ts). Add a new source by writing a
// map*() function that returns a ProjectEntity; everything downstream (storage,
// loader, card) is source-agnostic.

/** CSS colour for a project's status dot, by Linear-style status type. */
export function statusColour(statusType?: string): string {
  switch (statusType) {
    case 'started': return 'var(--yellow)'   // In Progress
    case 'completed': return 'var(--green)'  // Done
    case 'planned':
    case 'unstarted': return 'var(--blue)'   // Planned
    case 'canceled': return 'var(--red)'
    case 'backlog':
    default: return 'var(--text-3)'          // Backlog / unknown
  }
}

// ─── Linear ──────────────────────────────────────────────────────────────────

/** The subset of a Linear `list_projects` / `get_project` record we consume. */
export interface LinearProjectInput {
  id: string
  name: string
  summary?: string | null
  description?: string | null
  url: string
  status?: { name?: string | null; type?: string | null } | null
  targetDate?: string | null
  issueCount?: number | null
}

export function mapLinearProject(p: LinearProjectInput, importedAt: string): ProjectEntity {
  return {
    id: `linear:${p.id}`,
    type: 'project',
    source: 'linear',
    title: p.name,
    description: (p.summary || p.description || undefined) ?? undefined,
    status: p.status?.name ?? undefined,
    statusColour: statusColour(p.status?.type ?? undefined),
    issueCount: typeof p.issueCount === 'number' ? p.issueCount : undefined,
    targetDate: p.targetDate ?? undefined,
    sourceUrl: p.url,
    tags: [],
    importedAt,
  }
}

// ─── Claude projects ─────────────────────────────────────────────────────────

/** Shape we'd expect from Claude's project system (fields TBD). */
export interface ClaudeProjectInput {
  uuid: string
  name: string
  description?: string | null
}

/**
 * Map a Claude project to a ProjectEntity. STUB: Claude's project API isn't
 * accessible from the Log backend yet, so this is here so the source is wired
 * end-to-end and can be filled in once the data is available.
 */
export function mapClaudeProject(p: ClaudeProjectInput, importedAt: string): ProjectEntity {
  return {
    id: `claude:${p.uuid}`,
    type: 'project',
    source: 'claude',
    title: p.name,
    description: p.description ?? undefined,
    sourceUrl: `https://claude.ai/project/${p.uuid}`,
    tags: [],
    importedAt,
  }
}

// ─── Storage <-> entity ──────────────────────────────────────────────────────

/** A shape-id- and DB-safe artifact id derived from the entity id. */
export function projectArtifactId(entityId: string): string {
  return entityId.replace(/[^a-zA-Z0-9-]+/g, '-')
}

export interface ProjectImportItem {
  type: 'project'
  artifactId: string
  title: string
  sourceUrl: string
  content: string // JSON-encoded ProjectEntity
}

/** Serialise a ProjectEntity into the artifact row shape for /import/projects. */
export function projectEntityToImportItem(e: ProjectEntity): ProjectImportItem {
  return {
    type: 'project',
    artifactId: projectArtifactId(e.id),
    title: e.title,
    sourceUrl: e.sourceUrl,
    content: JSON.stringify(e),
  }
}

/** Parse a stored artifact's content back into a ProjectEntity (or null). */
export function parseProjectEntity(content: string | null): ProjectEntity | null {
  if (!content) return null
  try {
    const e = JSON.parse(content) as ProjectEntity
    return e && e.type === 'project' ? e : null
  } catch {
    return null
  }
}

/** Human label + glyph hint for a source link. */
export function sourceLinkLabel(source: ProjectSource): string {
  switch (source) {
    case 'linear': return 'Open in Linear'
    case 'claude': return 'Open in Claude'
    case 'git': return 'Open repo'
    default: return 'Open source'
  }
}
