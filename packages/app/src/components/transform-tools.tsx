import type { TransformMode } from '@dilemma/view'
import selectIcon from 'lucide-static/icons/mouse-pointer.svg?raw'
import moveIcon from 'lucide-static/icons/move.svg?raw'
import rotateIcon from 'lucide-static/icons/rotate-cw.svg?raw'
import scaleIcon from 'lucide-static/icons/scaling.svg?raw'
import { canDeleteKeys, deleteKeys, keySelection, newClip } from '../animation.ts'
import { useEditorState } from '../editor.ts'
import { useUi } from '../ui-store.ts'

export const transformTools = [
  { mode: 'select', label: 'Select', shortcut: 'q', icon: selectIcon },
  { mode: 'translate', label: 'Move', shortcut: 'w', icon: moveIcon },
  { mode: 'rotate', label: 'Rotate', shortcut: 'e', icon: rotateIcon },
  { mode: 'scale', label: 'Scale', shortcut: 'r', icon: scaleIcon },
] as const satisfies readonly {
  mode: TransformMode
  label: string
  shortcut: string
  icon: string
}[]

export function TransformTools() {
  const { doc, selection } = useEditorState()
  const mode = useUi((s) => s.transformMode)
  const range = useUi((s) => s.timelineRange)
  const canDelete = canDeleteKeys()
  if (doc.characters.length === 0) return null

  return (
    <div data-animation-tools className="absolute top-2 left-2 flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Transform tools" className="flex gap-1 rounded-md bg-panel p-1">
        {transformTools.map(({ mode: tool, label, shortcut, icon }) => {
          const mask = `url("data:image/svg+xml,${encodeURIComponent(icon)}")`
          return (
            <button
              key={tool}
              type="button"
              className="shell-icon selection-tint relative isolate"
              aria-label={label}
              aria-pressed={mode === tool}
              aria-keyshortcuts={shortcut.toUpperCase()}
              title={`${label} (${shortcut.toUpperCase()})`}
              onClick={() => useUi.getState().setTransformMode(tool)}
            >
              <span
                aria-hidden="true"
                className="size-4 bg-current"
                style={{ mask: `${mask} center / contain no-repeat` }}
              />
            </button>
          )
        })}
      </div>
      <div
        role="group"
        aria-label="Animation actions"
        className="flex gap-1 rounded-md bg-panel p-1"
      >
        <button type="button" className="shell-action" onClick={newClip}>
          New clip
        </button>
        <button
          type="button"
          className="shell-action"
          title="Set current transform key (S)"
          disabled={selection.joints.length !== 1}
          onClick={keySelection}
        >
          Set key
        </button>
        <button
          type="button"
          className="shell-action"
          title={range ? 'Delete keys in timeline selection' : 'Delete keys at playhead'}
          disabled={!canDelete}
          onClick={deleteKeys}
        >
          Delete keys
        </button>
      </div>
    </div>
  )
}
