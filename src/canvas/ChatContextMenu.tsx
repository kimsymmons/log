import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'
import { useChatPanel } from './ChatPanelContext'

/**
 * ContextMenu override (PEO-155). Prepends a "Chat about this →" item when
 * exactly one shape is right-clicked; otherwise renders the default menu.
 */
export function ChatContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()
  const { openPanel } = useChatPanel()
  const onlyShape = useValue('onlySelectedShape', () => editor.getOnlySelectedShape(), [editor])

  return (
    <DefaultContextMenu {...props}>
      {onlyShape && (
        <TldrawUiMenuGroup id="chat-trigger">
          <TldrawUiMenuItem
            id="chat-about-this"
            label="Chat about this →"
            readonlyOk
            onSelect={() => {
              openPanel({
                id: onlyShape.id,
                type: onlyShape.type,
                props: onlyShape.props as Record<string, unknown>,
              })
            }}
          />
        </TldrawUiMenuGroup>
      )}
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  )
}
