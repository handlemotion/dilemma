import type { TransformMode } from '@dilemma/view'
import { exportAnimation } from '../actions.ts'
import { newClip } from '../animation.ts'
import { bridge } from '../bridge.ts'
import { editor, useEditorState } from '../editor.ts'
import { Icon, type IconName } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'

export const transformTools = [
  { mode: 'translate', label: 'Move', shortcut: 'w', icon: 'move' },
  { mode: 'rotate', label: 'Rotate', shortcut: 'e', icon: 'rotate' },
  { mode: 'scale', label: 'Scale', shortcut: 'r', icon: 'scale' },
  { mode: 'ik', label: 'Limb IK', shortcut: 'i', icon: null },
] as const satisfies readonly {
  mode: TransformMode
  label: string
  shortcut: string
  icon: IconName | null
}[]

export function AnimationActions({ onImport }: { onImport(): void }) {
  const hasCharacter = useEditorState((s) => s.doc.characters.length > 0)
  const canUndo = useEditorState((s) => s.canUndo)
  const canRedo = useEditorState((s) => s.canRedo)
  const clipId = useEditorState((s) => s.playhead.clipId)
  const loading = useUi((s) => s.loading)

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Animation actions"
      className="col-span-full flex min-w-0 items-center gap-2 border-b border-line bg-panel px-2"
    >
      <button
        type="button"
        className="shell-icon"
        aria-label="Import character"
        title="Import character"
        disabled={Boolean(loading)}
        onClick={onImport}
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
      <IconButton onClick={() => editor.undo()} disabled={!canUndo} title="Undo (⌘Z)" icon="undo" />
      <IconButton
        onClick={() => editor.redo()}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
        icon="redo"
      />
      {bridge && (
        <>
          <button
            type="button"
            className="shell-action ms-auto"
            disabled={!clipId || Boolean(loading)}
            onClick={() => void exportAnimation()}
          >
            Export GLB
          </button>
          <button
            type="button"
            className="shell-action"
            disabled={!clipId || Boolean(loading)}
            onClick={() => void exportAnimation('fbx')}
          >
            Export FBX
          </button>
        </>
      )}
    </div>
  )
}

function IconButton(props: { onClick(): void; disabled: boolean; title: string; icon: IconName }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      className="shell-icon"
    >
      <Icon name={props.icon} size={15} />
    </button>
  )
}

export function TransformTools() {
  const mode = useUi((s) => s.transformMode)
  const autoKey = useUi((s) => s.autoKey)
  const ikHint = useEditorState(({ doc, playhead, selection }) => {
    const clip = doc.clips.find(({ id }) => id === playhead.clipId)
    const selected = selection.joints.length === 1 ? selection.joints[0] : undefined
    const limb = clip?.limb
    if (limb && selected?.characterId === clip.characterId && selected.joint !== limb.tip) {
      const character = doc.characters.find(({ id }) => id === clip.characterId)
      const name = character?.skeleton.joints[limb.tip]?.name
      if (name) return `Select ${name} to edit this clip’s IK target.`
    }
    const joints = doc.characters.find(({ id }) => id === selected?.characterId)?.skeleton.joints
    const parent = selected ? (joints?.[selected.joint]?.parent ?? -1) : -1
    return (joints?.[parent]?.parent ?? -1) < 0
      ? 'Select a wrist or ankle.'
      : autoKey
        ? 'Drag the target to key it, or press S.'
        : 'Drag the target into place, then press S to key it.'
  })

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Viewport tools"
      className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2"
    >
      {mode === 'ik' && (
        <p className="mb-2 rounded-md bg-panel px-2 py-1 text-center text-xs whitespace-nowrap text-ink">
          {ikHint}
        </p>
      )}
      <div className="mx-auto flex w-fit items-center gap-1 rounded-lg border border-ink/10 bg-panel bg-clip-padding p-1.5">
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
            {icon ? <Icon name={icon} /> : <span className="text-xs font-semibold">IK</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
