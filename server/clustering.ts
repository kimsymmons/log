import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import type { AnthropicCreateLike } from './linking'
import { inferProjectType } from './projectInference'
import type { ProjectType } from './projectInference'

export type { ProjectType }

export type ClusterSuggestion = {
  id: string
  label: string
  artifactIds: string[]
  projectType: ProjectType
  confidence: number
}

type ArtifactRow = { id: string; content: string | null }
type LinkRow = { source_id: string; target_id: string }

export function findConnectedComponents(
  nodes: string[],
  edges: Array<{ source: string; target: string }>
): string[][] {
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n, new Set())
  for (const { source, target } of edges) {
    adj.get(source)?.add(target)
    adj.get(target)?.add(source)
  }

  const visited = new Set<string>()
  const components: string[][] = []

  for (const node of nodes) {
    if (visited.has(node)) continue
    const component: string[] = []
    const queue = [node]
    visited.add(node)
    while (queue.length > 0) {
      const curr = queue.shift()!
      component.push(curr)
      for (const neighbor of adj.get(curr) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    components.push(component)
  }

  return components
}

export async function suggestClusters(
  db: Database.Database,
  anthropic: AnthropicCreateLike
): Promise<ClusterSuggestion[]> {
  const artifacts = db.prepare('SELECT id, content FROM artifacts').all() as ArtifactRow[]
  if (artifacts.length === 0) return []

  const links = db.prepare(
    `SELECT source_id, target_id FROM artifact_links
     WHERE provenance != 'dismissed' AND confidence >= 0.6`
  ).all() as LinkRow[]

  const nodeIds = artifacts.map(a => a.id)
  const edges = links.map(l => ({ source: l.source_id, target: l.target_id }))
  const components = findConnectedComponents(nodeIds, edges)

  const multiArtifact = components.filter(c => c.length >= 2)
  if (multiArtifact.length === 0) return []

  const artifactMap = new Map(artifacts.map(a => [a.id, a]))

  const results: ClusterSuggestion[] = []
  for (const component of multiArtifact) {
    const componentArtifacts = component
      .map(id => artifactMap.get(id))
      .filter((a): a is ArtifactRow => a !== undefined)

    const inferred = await inferProjectType(componentArtifacts, anthropic)

    results.push({
      id: ulid(),
      label: `${inferred.type.charAt(0).toUpperCase() + inferred.type.slice(1)} cluster`,
      artifactIds: component,
      projectType: inferred.type,
      confidence: inferred.confidence,
    })
  }

  results.sort((a, b) => b.artifactIds.length - a.artifactIds.length)
  return results
}
