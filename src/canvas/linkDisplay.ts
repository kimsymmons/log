export interface LinkDisplayProps {
  visible: boolean
  strokeWidth: number
  opacity: number
  strokeDasharray: string
}

export function linkDisplayProps(strength: number, provenance: string): LinkDisplayProps {
  if (provenance === 'dismissed' || strength < 0.5) {
    return { visible: false, strokeWidth: 1, opacity: 0, strokeDasharray: 'none' }
  }

  const strokeWidth = strength >= 1.0 ? 2 : 1
  const opacity = strength >= 1.0 ? 1.0 : 0.6
  const strokeDasharray = (provenance === 'user-pinned' || provenance === 'user-made') ? 'none' : '5 4'

  return { visible: true, strokeWidth, opacity, strokeDasharray }
}
