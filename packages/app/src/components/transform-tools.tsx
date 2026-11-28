import { Menu } from '@base-ui/react/menu'
import type { ReactNode } from 'react'
import {
  CONTROL_IDS,
  CONTROL_LABELS,
  controlJoint,
  controlKind,
  selectedControl,
  type ControlId,
} from '@dilemma/core'
import { pinSelection, selectJoints, toggleEffectorPin } from '../animation.ts'
import { bridge } from '../bridge.ts'
import { RigReviewTool } from './rig-review.tsx'
import type { TransformMode } from '@dilemma/view'
import type { MenuAction } from '../../electron/ipc.ts'
import { useEditorState } from '../editor.ts'
import { ActionIcon, type ActionIconName } from '../icons/action.tsx'
import { Icon } from '../icons/central.tsx'
import { useUi } from '../ui-store.ts'

interface TransformTool {
  mode: TransformMode
  label: string
  shortcut: string
  icon: ActionIconName
}

const viewportTransforms = [
  { mode: 'translate', label: 'Move', shortcut: 'w', icon: 'move' },
  { mode: 'rotate', label: 'Rotate', shortcut: 'e', icon: 'rotate' },
  { mode: 'scale', label: 'Scale', shortcut: 'r', icon: 'scale' },
] as const satisfies readonly TransformTool[]

const pose = {
  mode: 'ik',
  label: 'Pose',
  shortcut: 'i',
  icon: 'pose',
} as const satisfies TransformTool

export const transformTools = [...viewportTransforms, pose]

export function MainToolbar({ run }: { run(action: MenuAction): void }) {
  const { canUndo, canRedo, doc, playhead } = useEditorState()
  const loading = useUi((s) => s.loading)
  const posing = useUi((s) => s.transformMode === 'ik' && !s.rigSetup)

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Main tools"
      className="col-span-full row-start-2 flex h-10 min-w-0 items-center gap-1.5 border-b border-line bg-shell p-1"
    >
      <div role="group" aria-label="History" data-action-group="history" className="flex gap-1">
        <ToolbarAction
          icon={<Icon name="undo" size={20} />}
          label="Undo"
          disabled={!canUndo}
          run={() => run('undo')}
        />
        <ToolbarAction
          icon={<Icon name="redo" size={20} />}
          label="Redo"
          disabled={!canRedo}
          run={() => run('redo')}
        />
      </div>
      <span aria-hidden="true" className="h-4 border-l border-line" />
      <div
        role="group"
        aria-label="Character and clip"
        data-action-group="setup"
        className="flex gap-1"
      >
        <ToolbarAction
          icon={<ActionIcon name="importCharacter" />}
          label="Import Character"
          disabled={Boolean(loading)}
          run={() => run('open')}
        />
        <ToolbarAction
          icon={<ActionIcon name="newClip" />}
          label="New Clip"
          disabled={!doc.characters.length}
          run={() => run('newClip')}
        />
      </div>
      <span aria-hidden="true" className="h-4 border-l border-line" />
      <RigReviewTool />
      <Menu.Root>
        <Menu.Trigger
          className="shell-icon shell-rail-icon"
          data-action-group="export"
          aria-label="Export Animation"
          title="Export Animation"
          disabled={!bridge || !playhead.clipId || Boolean(loading)}
        >
          <ActionIcon name="exportAnimation" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="start" className="z-40">
            <Menu.Popup className="min-w-36 rounded-md border border-line bg-raised p-1 text-xs outline-none">
              <Menu.Item className={exportItem} onClick={() => run('exportGlb')}>
                GLB…
              </Menu.Item>
              <Menu.Item className={exportItem} onClick={() => run('exportFbx')}>
                FBX…
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {posing && <PoseOptions />}
    </div>
  )
}

const exportItem =
  'cursor-default rounded-sm px-2 py-1.5 text-ink outline-none data-highlighted:bg-control'

export function ViewportPoseTools() {
  return (
    <>
      <TransformToolButton tool={pose} />
      <PinEffectorTool />
    </>
  )
}

function PinEffectorTool() {
  const pin = useEditorState(() => pinSelection())
  const drafting = useUi((s) => Boolean(s.transformDraft || s.rigSetup))
  return (
    <button
      type="button"
      className="shell-icon shell-rail-icon shell-toggle"
      data-action-group="pose"
      aria-label="Pin Effector"
      aria-pressed={Boolean(pin?.pinned)}
      disabled={!pin || drafting}
      title={pin?.pinned ? 'Unpin Effector' : pin ? 'Pin Effector' : 'Select a hand or foot to pin'}
      onClick={toggleEffectorPin}
    >
      <ActionIcon name="pinEffector" />
    </button>
  )
}

function ToolbarAction({
  icon,
  label,
  disabled,
  run,
}: {
  icon: ReactNode
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
      {icon}
    </button>
  )
}

export function ViewportTransformTools() {
  return viewportTransforms.map((tool) => <TransformToolButton key={tool.mode} tool={tool} />)
}

function TransformToolButton({ tool }: { tool: TransformTool }) {
  const { mode, shortcut, icon, label } = tool
  const active = useUi((s) => s.transformMode === mode)
  const key = shortcut.toUpperCase()
  return (
    <button
      type="button"
      className="shell-icon shell-rail-icon shell-toggle"
      data-action-group={mode === 'ik' ? 'pose' : 'transform'}
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={key}
      title={`${label} (${key})`}
      onClick={() => useUi.getState().setTransformMode(mode)}
    >
      <ActionIcon name={icon} />
    </button>
  )
}

function PoseOptions() {
  const autoKey = useUi((s) => s.autoKey)
  const { doc, playhead, selection } = useEditorState()
  const lead = selection.joints.length === 1 ? selection.joints[0] : undefined
  const clip = doc.clips.find(({ id }) => id === playhead.clipId)
  const character =
    doc.characters.find(({ id }) => id === (lead?.characterId ?? clip?.characterId)) ??
    doc.characters[0]
  if (!character) return null

  const ids = CONTROL_IDS.filter(
    (id) => controlJoint(character.skeleton, character.rig, id) !== undefined,
  )
  const selected = lead && selectedControl(character.skeleton, character.rig, lead)
  const limb = clip?.limb
  const legacyTip =
    limb && doc.characters.find(({ id }) => id === clip.characterId)?.skeleton.joints[limb.tip]
  const hint = !character.rig?.confirmed
    ? legacyTip
      ? `Select ${legacyTip.name} to edit the IK target, or open Rig Setup for pose controls.`
      : 'Set up the rig to use pose controls.'
    : ids.length === 0
      ? 'Map joints in Rig Mapping to use pose controls.'
      : selected && clip?.pins && Object.hasOwn(clip.pins, selected)
        ? `${CONTROL_LABELS[selected]} pinned for this clip`
        : selected && controlKind(selected) === 'rotation'
          ? 'Drag a rotation ring.'
          : autoKey
            ? 'Drag a blue handle to pose.'
            : 'Drag a handle, then press S to key.'

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-raised p-1 text-xs text-muted">
      {ids.length > 0 && (
        <select
          aria-label="Pose control"
          className="shell-field bg-control px-2"
          value={selected ?? ''}
          onChange={(event) => {
            const control = event.currentTarget.value as ControlId
            const joint = controlJoint(character.skeleton, character.rig, control)
            if (joint !== undefined) selectJoints([{ characterId: character.id, joint, control }])
          }}
        >
          <option value="" disabled>
            Choose control
          </option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {CONTROL_LABELS[id]}
            </option>
          ))}
        </select>
      )}
      <span className="px-1">{hint}</span>
    </div>
  )
}
