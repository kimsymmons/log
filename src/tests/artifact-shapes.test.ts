import { describe, it, expect } from 'vitest'

// These imports will fail until ArtifactShapes.tsx is created
import {
  renderMarkdown,
  truncateContent,
  artifactTypeToShapeType,
  ARTIFACT_COLLAPSED_SIZE,
  ARTIFACT_EXPANDED_SIZE,
  MarkdownArtifactShapeUtil,
  CodeArtifactShapeUtil,
  ImageArtifactShapeUtil,
} from '../shapes/ArtifactShapes'

import { parseSseData } from '../shapes/ChatCard'

// ── renderMarkdown ──────────────────────────────────────────────────────────

describe('renderMarkdown', () => {
  it('converts **bold** to <strong>', () => {
    expect(renderMarkdown('Hello **world**')).toContain('<strong>world</strong>')
  })

  it('converts ## heading to <h2>', () => {
    expect(renderMarkdown('## My heading')).toContain('<h2>My heading</h2>')
  })

  it('converts # heading to <h1>', () => {
    expect(renderMarkdown('# Top level')).toContain('<h1>Top level</h1>')
  })

  it('converts `inline code` to <code>', () => {
    expect(renderMarkdown('Use `npm test` now')).toContain('<code>npm test</code>')
  })

  it('escapes < and > to prevent XSS', () => {
    const result = renderMarkdown('<script>alert(1)</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })

  it('converts blank lines to <br><br>', () => {
    expect(renderMarkdown('line one\n\nline two')).toContain('<br><br>')
  })

  it('passes plain text through unchanged (except wrapping)', () => {
    const result = renderMarkdown('just text')
    expect(result).toContain('just text')
  })
})

// ── truncateContent ─────────────────────────────────────────────────────────

describe('truncateContent', () => {
  it('returns content unchanged when 40 chars or fewer', () => {
    expect(truncateContent('short')).toBe('short')
  })

  it('returns exactly 40 chars with ellipsis when longer', () => {
    const long = 'a'.repeat(50)
    const result = truncateContent(long)
    expect(result).toBe('a'.repeat(40) + '…')
  })

  it('returns content unchanged when exactly 40 chars', () => {
    const exactly40 = 'a'.repeat(40)
    expect(truncateContent(exactly40)).toBe(exactly40)
  })

  it('respects a custom max length', () => {
    expect(truncateContent('hello world', 5)).toBe('hello…')
  })
})

// ── artifactTypeToShapeType ─────────────────────────────────────────────────

describe('artifactTypeToShapeType', () => {
  it('maps markdown → markdown-artifact', () => {
    expect(artifactTypeToShapeType('markdown')).toBe('markdown-artifact')
  })

  it('maps code → code-artifact', () => {
    expect(artifactTypeToShapeType('code')).toBe('code-artifact')
  })

  it('maps image → image-artifact', () => {
    expect(artifactTypeToShapeType('image')).toBe('image-artifact')
  })
})

// ── Size constants ──────────────────────────────────────────────────────────

describe('artifact size constants', () => {
  it('ARTIFACT_COLLAPSED_SIZE has w and h', () => {
    expect(ARTIFACT_COLLAPSED_SIZE).toMatchObject({ w: expect.any(Number), h: expect.any(Number) })
  })

  it('ARTIFACT_EXPANDED_SIZE is larger than collapsed', () => {
    expect(ARTIFACT_EXPANDED_SIZE.w).toBeGreaterThan(ARTIFACT_COLLAPSED_SIZE.w)
    expect(ARTIFACT_EXPANDED_SIZE.h).toBeGreaterThan(ARTIFACT_COLLAPSED_SIZE.h)
  })
})

// ── ShapeUtil type names ────────────────────────────────────────────────────

describe('artifact shape util types', () => {
  it('MarkdownArtifactShapeUtil.type is markdown-artifact', () => {
    expect(MarkdownArtifactShapeUtil.type).toBe('markdown-artifact')
  })

  it('CodeArtifactShapeUtil.type is code-artifact', () => {
    expect(CodeArtifactShapeUtil.type).toBe('code-artifact')
  })

  it('ImageArtifactShapeUtil.type is image-artifact', () => {
    expect(ImageArtifactShapeUtil.type).toBe('image-artifact')
  })
})

// ── parseSseData — artifacts extension ─────────────────────────────────────

describe('parseSseData with artifacts', () => {
  it('parses summary with artifacts array', () => {
    const data = JSON.stringify({
      summary: {
        title: 'My Chat',
        body: 'A summary.',
        artifacts: [{ type: 'markdown', title: 'Note', content: '# Hello' }],
      },
    })
    const result = parseSseData(data)
    expect(result).toMatchObject({ type: 'summary', title: 'My Chat', body: 'A summary.' })
    expect((result as { artifacts?: unknown[] }).artifacts).toHaveLength(1)
    expect((result as { artifacts?: Array<{ type: string }> }).artifacts?.[0].type).toBe('markdown')
  })

  it('parses summary without artifacts (backwards compat)', () => {
    const data = JSON.stringify({ summary: { title: 'Old Chat', body: 'Legacy.' } })
    const result = parseSseData(data)
    expect(result).toMatchObject({ type: 'summary', title: 'Old Chat', body: 'Legacy.' })
    expect((result as { artifacts?: unknown }).artifacts).toBeUndefined()
  })

  it('ignores empty artifacts array', () => {
    const data = JSON.stringify({ summary: { title: 'T', body: 'B', artifacts: [] } })
    const result = parseSseData(data)
    expect((result as { artifacts?: unknown }).artifacts).toBeUndefined()
  })
})
