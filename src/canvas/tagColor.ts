/**
 * Tags carry colour; cards stay neutral. A tag's colour is derived
 * deterministically from its label so the same tag is always the same hue
 * across every card and connection. Colours are sticky-note palette names
 * (see tokens.css `--sticky-*`), which the Tag component tints.
 */
const TAG_COLORS = ['yellow', 'green', 'blue', 'purple', 'pink', 'gray'] as const
export type TagColor = (typeof TAG_COLORS)[number]

export function tagColor(tag: string): TagColor {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}
