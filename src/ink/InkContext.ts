import React from 'react'
import type { Stroke } from './InkLayer'

export interface InkCtx {
  inkActive: boolean
  eraserActive: boolean
  strokes: Stroke[]
  /** Concrete CSS colour for new strokes (resolved from a design token). */
  inkColor: string
  /** Stroke width in page units for new strokes. */
  inkWidth: number
  /** Highlighter mode — translucent, wider strokes. */
  highlighter: boolean
  setInkActive: (v: boolean) => void
  setEraserActive: (v: boolean) => void
  setStrokes: (v: Stroke[]) => void
  setInkColor: (v: string) => void
  setInkWidth: (v: number) => void
  setHighlighter: (v: boolean) => void
}

export const InkContext = React.createContext<InkCtx>({
  inkActive: false,
  eraserActive: false,
  strokes: [],
  inkColor: '',
  inkWidth: 3.5,
  highlighter: false,
  setInkActive: () => {},
  setEraserActive: () => {},
  setStrokes: () => {},
  setInkColor: () => {},
  setInkWidth: () => {},
  setHighlighter: () => {},
})
