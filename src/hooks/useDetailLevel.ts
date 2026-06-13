import { useMaybeEditor, useValue } from 'tldraw'

// ── Semantic zoom (PEO-143) ──────────────────────────────────────────────────
//
// Canvas nodes render at three levels of detail depending on the camera zoom:
//   • full    (zoom ≥ 0.85) — everything visible
//   • compact (0.6 ≤ zoom < 0.85) — body text + external links hidden
//   • minimal (zoom < 0.6) — only glyph + title; card shrinks to ~40px
//
// Hidden elements are kept in the DOM with `display: none` rather than being
// conditionally rendered, so toggling detail levels never remounts a shape.

export type DetailLevel = 'minimal' | 'compact' | 'full'

/** Pure mapping from a zoom level to a detail level. */
export function getDetailLevel(zoom: number): DetailLevel {
  if (zoom < 0.6) return 'minimal'
  if (zoom < 0.85) return 'compact'
  return 'full'
}

/** CSS `display` flags derived from a detail level, for use in shape components. */
export function detailDisplay(level: DetailLevel) {
  return {
    /** Body text and external links — hidden in compact and minimal. */
    body: level === 'full' ? undefined : ('none' as const),
    /** Secondary chrome (status, tags, tools…) — hidden only in minimal. */
    secondary: level === 'minimal' ? ('none' as const) : undefined,
    /** True when the card should collapse to glyph + title only. */
    minimal: level === 'minimal',
  }
}

/**
 * Reactive detail level driven by the editor's current zoom. Returns `'full'`
 * when no editor is in context (e.g. unit tests rendering a shape in isolation),
 * so shapes show their complete content by default.
 */
export function useDetailLevel(): DetailLevel {
  const editor = useMaybeEditor()
  return useValue(
    'detailLevel',
    () => (editor ? getDetailLevel(editor.getZoomLevel()) : 'full'),
    [editor],
  )
}
