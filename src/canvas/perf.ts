export interface Artifact {
  id: string
  canvas_x: number
  canvas_y: number
  canvas_w: number
  canvas_h: number
}

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

export function computeVisibleShapes(shapes: Artifact[], viewport: Viewport): Artifact[] {
  const vRight = viewport.x + viewport.width
  const vBottom = viewport.y + viewport.height
  return shapes.filter((s) => {
    const sRight = s.canvas_x + s.canvas_w
    const sBottom = s.canvas_y + s.canvas_h
    return s.canvas_x < vRight && sRight > viewport.x && s.canvas_y < vBottom && sBottom > viewport.y
  })
}

export function getLOD(zoom: number): 'full' | 'minimal' {
  return zoom >= 0.5 ? 'full' : 'minimal'
}
