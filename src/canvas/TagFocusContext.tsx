import React, { createContext, useContext, useMemo, useState } from 'react'

/**
 * Focus follows tags, not cards. Hovering a tag chip publishes that tag here;
 * connection lines and chips elsewhere react to it. Hovering a card body does
 * nothing — only tags drive focus.
 */
interface TagFocusValue {
  hovered: string | null
  setHovered: (tag: string | null) => void
}

const TagFocusContext = createContext<TagFocusValue>({
  hovered: null,
  setHovered: () => {},
})

export function TagFocusProvider({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const value = useMemo(() => ({ hovered, setHovered }), [hovered])
  return <TagFocusContext.Provider value={value}>{children}</TagFocusContext.Provider>
}

export function useTagFocus() {
  return useContext(TagFocusContext)
}
