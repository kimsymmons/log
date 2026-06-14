import { describe, it, expect } from 'vitest'
import {
  mapLinearProject,
  mapClaudeProject,
  statusColour,
  projectArtifactId,
  projectEntityToImportItem,
  parseProjectEntity,
  sourceLinkLabel,
  type LinearProjectInput,
} from '../projectMapping'

const linear: LinearProjectInput = {
  id: 'c195',
  name: 'Log',
  summary: 'Infinite canvas. AI chats live as spatial objects.',
  url: 'https://linear.app/peoplez/project/log-4f017c5148f6',
  status: { name: 'In Progress', type: 'started' },
  targetDate: '2026-06-14',
}

describe('statusColour', () => {
  it('maps Linear status types to dot colours', () => {
    expect(statusColour('started')).toBe('var(--yellow)')
    expect(statusColour('completed')).toBe('var(--green)')
    expect(statusColour('planned')).toBe('var(--blue)')
    expect(statusColour('canceled')).toBe('var(--red)')
    expect(statusColour('backlog')).toBe('var(--text-3)')
    expect(statusColour(undefined)).toBe('var(--text-3)')
  })
})

describe('mapLinearProject', () => {
  it('normalises a Linear project to a ProjectEntity', () => {
    const e = mapLinearProject(linear, '2026-06-14T00:00:00.000Z')
    expect(e).toMatchObject({
      id: 'linear:c195',
      type: 'project',
      source: 'linear',
      title: 'Log',
      description: 'Infinite canvas. AI chats live as spatial objects.',
      status: 'In Progress',
      statusColour: 'var(--yellow)',
      targetDate: '2026-06-14',
      sourceUrl: 'https://linear.app/peoplez/project/log-4f017c5148f6',
      tags: [],
      importedAt: '2026-06-14T00:00:00.000Z',
    })
  })

  it('falls back to description when summary is missing', () => {
    const e = mapLinearProject({ ...linear, summary: null, description: 'the desc' }, 'now')
    expect(e.description).toBe('the desc')
  })

  it('leaves issueCount/targetDate undefined when absent', () => {
    const e = mapLinearProject({ id: 'x', name: 'X', url: 'u' }, 'now')
    expect(e.issueCount).toBeUndefined()
    expect(e.targetDate).toBeUndefined()
    expect(e.statusColour).toBe('var(--text-3)')
  })
})

describe('mapClaudeProject (stub)', () => {
  it('produces a claude-sourced ProjectEntity', () => {
    const e = mapClaudeProject({ uuid: 'abc', name: 'My project' }, 'now')
    expect(e.id).toBe('claude:abc')
    expect(e.source).toBe('claude')
    expect(e.sourceUrl).toBe('https://claude.ai/project/abc')
  })
})

describe('projectArtifactId', () => {
  it('sanitises entity ids to be shape-id / DB safe', () => {
    expect(projectArtifactId('linear:c195')).toBe('linear-c195')
    expect(projectArtifactId('claude:abc.def')).toBe('claude-abc-def')
  })
})

describe('serialize / parse round-trip', () => {
  it('round-trips a ProjectEntity through the import item', () => {
    const e = mapLinearProject(linear, 'now')
    const item = projectEntityToImportItem(e)
    expect(item).toMatchObject({ type: 'project', artifactId: 'linear-c195', title: 'Log', sourceUrl: e.sourceUrl })
    expect(parseProjectEntity(item.content)).toEqual(e)
  })

  it('returns null for bad content', () => {
    expect(parseProjectEntity(null)).toBeNull()
    expect(parseProjectEntity('not json')).toBeNull()
    expect(parseProjectEntity('{"type":"chat"}')).toBeNull()
  })
})

describe('sourceLinkLabel', () => {
  it('labels by source', () => {
    expect(sourceLinkLabel('linear')).toBe('Open in Linear')
    expect(sourceLinkLabel('claude')).toBe('Open in Claude')
    expect(sourceLinkLabel('git')).toBe('Open repo')
  })
})
