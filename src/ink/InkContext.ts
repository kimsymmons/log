import React from 'react'
import type { Stroke } from './InkLayer'

export interface InkCtx {
  inkActive: boolean
  eraserActive: boolean
  strokes: Stroke[]
  setInkActive: (v: boolean) => void
  setEraserActive: (v: boolean) => void
  setStrokes: (v: Stroke[]) => void
}

export const InkContext = React.createContext<InkCtx>({
  inkActive: false,
  eraserActive: false,
  strokes: [],
  setInkActive: () => {},
  setEraserActive: () => {},
  setStrokes: () => {},
})
