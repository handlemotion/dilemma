import type { TransformMode } from '@dilemma/view'
import { useRef } from 'react'
import { importCharacter } from '../actions.ts'
import { newClip } from '../animation.ts'
import { bridge } from '../bridge.ts'
import { useEditorState } from '../editor.ts'
import { Icon, type IconName } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'

export const transformTools = [
  { mode: 'select', label: 'Select', shortcut: 'q', icon: 'select' },
  { mode: 'translate', label: 'Move', shortcut: 'w', icon: 'move' },
  { mode: 'rotate', label: 'Rotate', shortcut: 'e', icon: 'rotate' },
  { mode: 'scale', label: 'Scale', shortcut: 'r', icon: 'scale' },
] as const satisfies readonly {
  mode: TransformMode
  label: string
  shortcut: string
  icon: IconName
}[]

export function AnimationActions() {
  const hasCharacter = useEditorState((s) => s.doc.characters.length > 0)
  const loading = useUi((s) => s.loading)
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Animation actions"
      className="col-span-full flex min-w-0 items-center gap-2 border-b border-line bg-panel px-2"
    >
      <input
        ref={fileInput}
        type="file"
        accept=".glb,.gltf"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void importCharacter(file)
          event.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        className="shell-icon"
        aria-label="Import character"
        title="Import character"
        disabled={Boolean(loading)}
        onClick={() => {
          if (bridge) void importCharacter()
          else fileInput.current?.click()
        }}
      >
        <Icon name="import" />
      </button>
      <button
        type="button"
        className="shell-icon"
        aria-label="New clip"
        title="New clip"
        disabled={!hasCharacter}
        onClick={newClip}
      >
        <Icon name="newClip" />
      </button>
    </div>
  )
}

export function TransformTools() {
  const mode = useUi((s) => s.transformMode)

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Viewport tools"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-ink/10 bg-panel bg-clip-padding p-1.5"
    >
      {transformTools.map(({ mode: tool, label, shortcut, icon }) => (
        <button
          key={tool}
          type="button"
          className="shell-icon shell-tool"
          aria-label={label}
          aria-pressed={mode === tool}
          aria-keyshortcuts={shortcut.toUpperCase()}
          title={`${label} (${shortcut.toUpperCase()})`}
          onClick={() => useUi.getState().setTransformMode(tool)}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  )
}
