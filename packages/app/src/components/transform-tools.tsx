import type { TransformMode } from '@dilemma/view'
import type { MenuAction } from '../../electron/ipc.ts'
import { useEditorState } from '../editor.ts'
import { Icon, type IconName } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'

interface TransformTool {
  mode: TransformMode
  label: string
  shortcut: string
  icon: IconName | null
}

const viewportTransforms = [
  { mode: 'translate', label: 'Move', shortcut: 'w', icon: 'move' },
  { mode: 'rotate', label: 'Rotate', shortcut: 'e', icon: 'rotate' },
  { mode: 'scale', label: 'Scale', shortcut: 'r', icon: 'scale' },
] as const satisfies readonly TransformTool[]

const limbIk = {
  mode: 'ik',
  label: 'Limb IK',
  shortcut: 'i',
  icon: null,
} as const satisfies TransformTool

export const transformTools = [...viewportTransforms, limbIk]

export function MainToolbar({ run }: { run(action: MenuAction): void }) {
  const { canUndo, canRedo, doc } = useEditorState()
  const loading = useUi((s) => s.loading)

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Main tools"
      className="col-span-full row-start-2 flex h-10 min-w-0 items-center gap-1.5 border-b border-line bg-shell p-1"
    >
      <div role="group" aria-label="History" className="flex gap-1">
        <ToolbarAction icon="undo" label="Undo" disabled={!canUndo} run={() => run('undo')} />
        <ToolbarAction icon="redo" label="Redo" disabled={!canRedo} run={() => run('redo')} />
      </div>
      <span aria-hidden="true" className="h-4 border-l border-line" />
      <div role="group" aria-label="Character and clip" className="flex gap-1">
        <ToolbarAction
          icon="import"
          label="Import Character"
          disabled={Boolean(loading)}
          run={() => run('open')}
        />
        <ToolbarAction
          icon="newClip"
          label="New Clip"
          disabled={!doc.characters.length}
          run={() => run('newClip')}
        />
      </div>
    </div>
  )
}

function ToolbarAction({
  icon,
  label,
  disabled,
  run,
}: {
  icon: IconName
  label: string
  disabled: boolean
  run(): void
}) {
  return (
    <button
      type="button"
      className="shell-icon shell-rail-icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={run}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}

export function LimbIkTool() {
  return <TransformToolButton tool={limbIk} />
}

export function ViewportTransformTools() {
  const isIk = useUi((s) => s.transformMode === 'ik')
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex flex-col items-center gap-1 px-1">
      {isIk && <LimbHint />}
      <div
        data-animation-tools
        role="toolbar"
        aria-label="Transform tools"
        className="pointer-events-auto flex gap-1 rounded-lg border border-line bg-raised p-1"
      >
        {viewportTransforms.map((tool) => (
          <TransformToolButton key={tool.mode} tool={tool} />
        ))}
      </div>
    </div>
  )
}

function TransformToolButton({ tool }: { tool: TransformTool }) {
  const { mode, shortcut, icon, label } = tool
  const active = useUi((s) => s.transformMode === mode)
  const key = shortcut.toUpperCase()
  return (
    <button
      type="button"
      className="shell-icon shell-rail-icon shell-tool"
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={key}
      title={`${label} (${key})`}
      onClick={() => useUi.getState().setTransformMode(mode)}
    >
      {icon ? <Icon name={icon} size={20} /> : <span className="text-sm font-semibold">IK</span>}
    </button>
  )
}

function LimbHint() {
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

  return <p className="rounded-md bg-raised px-2 py-1 text-center text-xs text-ink">{ikHint}</p>
}
