import { resetSelection, resetTarget, type ResetKind } from '../animation.ts'
import { useEditorState } from '../editor.ts'
import { ActionIcon, type ActionIconName } from '../icons/action.tsx'
import { motionTrailTarget } from '../motion-trail.ts'
import { useUi } from '../ui-store.ts'

const resetActions = [
  { kind: 'position', label: 'Reset Position', icon: 'resetPosition' },
  { kind: 'rotation', label: 'Reset Rotation', icon: 'resetRotation' },
  { kind: 'all', label: 'Reset Selected', icon: 'resetSelected' },
] as const

const poseActions = [
  { label: 'Mirror', icon: 'mirrorPose' },
  { label: 'Copy Pose', icon: 'copyPose' },
  { label: 'Paste Pose', icon: 'pastePose' },
  { label: 'Match World Transform', icon: 'matchWorld' },
] as const

const timingActions = [
  { label: 'Tween', icon: 'tween' },
  { label: 'Hold Pose', icon: 'holdPose' },
] as const

export function AnimationToolbar() {
  const state = useEditorState()
  const mode = useUi((s) => s.transformMode)
  const busy = useUi((s) => Boolean(s.rigSetup || s.transformDraft))
  const showTrails = useUi((s) => s.showMotionTrails)
  const rigSetup = useUi((s) => Boolean(s.rigSetup))
  const reset = busy ? undefined : resetTarget(state, mode)
  const canReset: Record<ResetKind, boolean> = {
    position: !!reset?.position,
    rotation: !!reset?.rotation,
    all: !!reset,
  }
  const canTrail = Boolean(motionTrailTarget(state))

  return (
    <div
      data-animation-tools
      role="toolbar"
      aria-label="Animation tools"
      className="col-span-full row-start-4 flex h-10 min-w-0 items-center gap-1.5 overflow-x-auto border-t border-line bg-shell p-1"
    >
      <div role="group" aria-label="Reset" data-action-group="transform" className="flex gap-1">
        {resetActions.map(({ kind, label, icon }) => (
          <button
            key={kind}
            type="button"
            className="shell-icon shell-rail-icon"
            aria-label={label}
            title={
              canReset[kind]
                ? `${label} to rig defaults`
                : `${label} is unavailable for this selection`
            }
            disabled={!canReset[kind]}
            onClick={() => resetSelection(kind)}
          >
            <ActionIcon name={icon} />
          </button>
        ))}
      </div>
      <Divider />
      <div role="group" aria-label="Pose editing" data-action-group="pose" className="flex gap-1">
        {poseActions.map(({ label, icon }) => (
          <PlannedAction key={icon} label={label} icon={icon} />
        ))}
      </div>
      <Divider />
      <div role="group" aria-label="Timing" data-action-group="keying" className="flex gap-1">
        {timingActions.map(({ label, icon }) => (
          <PlannedAction key={icon} label={label} icon={icon} />
        ))}
      </div>
      <Divider />
      <PlannedAction label="Add Contact" icon="addContact" />
      <Divider />
      <button
        type="button"
        className="shell-icon shell-rail-icon shell-toggle"
        data-action-group="workspace"
        aria-label="Motion Trails"
        aria-pressed={showTrails && !rigSetup}
        title={
          canTrail || showTrails
            ? 'Motion Trails · Show the selected joint’s path over the Preview range'
            : 'Motion Trails · Select one joint or pose control in an active clip'
        }
        disabled={rigSetup || (!canTrail && !showTrails)}
        onClick={() => useUi.getState().setShowMotionTrails(!showTrails)}
      >
        <ActionIcon name="motionTrails" />
      </button>
    </div>
  )
}

function Divider() {
  return <span aria-hidden="true" className="h-4 shrink-0 border-l border-line" />
}

function PlannedAction({ label, icon }: { label: string; icon: ActionIconName }) {
  return (
    <button
      type="button"
      className="shell-icon shell-rail-icon"
      aria-label={label}
      disabled
      title={`${label} · Coming soon`}
    >
      <ActionIcon name={icon} />
    </button>
  )
}
