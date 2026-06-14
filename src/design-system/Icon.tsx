import React, { useMemo, useEffect, useReducer } from 'react'

declare global {
  interface Window {
    lucide?: {
      icons: Record<string, Array<[string, Record<string, string>]>>
      createIcons: () => void
    }
  }
}

// lucide loads async from a CDN. Track when it's ready and re-render every Icon
// once it arrives, so glyphs never stay blank when the script lands late.
let lucideReady = typeof window !== 'undefined' && !!window.lucide?.icons
const readyListeners = new Set<() => void>()
// Poll only in the browser (the CDN script never loads under jsdom tests, so a
// poll there would just leak a timer).
if (typeof window !== 'undefined' && !lucideReady && (import.meta.env as { MODE?: string }).MODE !== 'test') {
  const poll = () => {
    if (window.lucide?.icons) {
      lucideReady = true
      readyListeners.forEach((l) => l())
      readyListeners.clear()
    } else {
      setTimeout(poll, 50)
    }
  }
  poll()
}

function useLucideReady(): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (lucideReady) return
    readyListeners.add(force)
    return () => { readyListeners.delete(force) }
  }, [])
  return lucideReady
}

interface IconProps {
  name: string
  size?: number
  strokeWidth?: number
  color?: string
  style?: React.CSSProperties
}

export function Icon({ name, size = 16, strokeWidth, color = 'currentColor', style }: IconProps) {
  const ready = useLucideReady()
  const sw = strokeWidth ?? Math.min(3.5, Math.round(((1.6 * 24) / size) * 10) / 10)
  const svg = useMemo(() => {
    const lib = typeof window !== 'undefined' ? window.lucide : null
    const icons = lib?.icons
    if (!icons) return ''
    const pascal = String(name).replace(/(^|-)([a-z0-9])/g, (_m, _sep, c: string) => c.toUpperCase())
    const node = icons[pascal]
    if (!node) return ''
    const inner = node
      .map(([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs ?? {}).map(([k, v]) => `${k}="${v}"`).join(' ')}></${tag}>`
      )
      .join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  }, [name, size, sw, ready])

  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, color, flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
