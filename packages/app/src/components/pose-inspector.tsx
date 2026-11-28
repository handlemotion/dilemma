import {
  bendControl,
  CONTROL_LABELS,
  controlJoint,
  EFFECTORS,
  isEffector,
  selectedControl,
  type Character,
  type ControlId,
} from '@dilemma/core'
import { selectJoints, toggleEffectorPin } from '../animation.ts'
import { useEditorState } from '../editor.ts'
import { Icon } from '../icons/central.tsx'
import { openRigSetup } from '../rig-setup.ts'
import { useUi } from '../ui-store.ts'

const groups = [
  { name: 'Body', controls: ['hips', 'chest', 'head'] },
  { name: 'Hands', controls: ['leftHand', 'rightHand'] },
  { name: 'Feet', controls: ['leftFoot', 'rightFoot'] },
] as const

export function PoseInspector({ character }: { character: Character }) {
  const { doc, playhead, selection } = useEditorState()
  const drafting = useUi((s) => s.transformDraft !== null)
  const { skeleton, rig } = character
  const clip = doc.clips.find(
    (item) => item.id === playhead.clipId && item.characterId === character.id,
  )
  const ref = selection.joints.length === 1 ? selection.joints[0] : undefined
  const selected =
    ref?.characterId === character.id ? selectedControl(skeleton, rig, ref) : undefined
  const effector =
    selected && EFFECTORS.find((id) => id === selected || bendControl(id) === selected)

  function row(control: ControlId) {
    const joint = controlJoint(skeleton, rig, control)
    if (joint === undefined) return null
    const target = { characterId: character.id, joint, control }
    const label = CONTROL_LABELS[control]
    const pinned = isEffector(control) && Boolean(clip?.pins?.[control])
    return (
      <div
        key={control}
        className="selection-tint relative isolate flex min-h-7 min-w-0 items-center rounded-md hover:bg-control"
        data-tinted={selected === control || undefined}
      >
        <button
          type="button"
          aria-pressed={selected === control}
          className="min-w-0 flex-1 self-stretch truncate rounded-md px-2 text-left"
          onClick={() => selectJoints([target])}
        >
          {label}
        </button>
        {isEffector(control) && (
          <button
            type="button"
            aria-label={`Pin ${label.toLowerCase()}`}
            aria-pressed={pinned}
            title={
              pinned ? `Unpin ${label.toLowerCase()}` : `Pin ${label.toLowerCase()} for this clip`
            }
            disabled={drafting}
            className="me-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-raised aria-pressed:text-emerald-700 disabled:opacity-50"
            onClick={() => {
              selectJoints([target])
              toggleEffectorPin()
            }}
          >
            <Icon name="pinEffector" size={14} />
          </button>
        )}
      </div>
    )
  }

  if (
    !rig?.confirmed ||
    groups.every(({ controls }) =>
      controls.every((control) => controlJoint(skeleton, rig, control) === undefined),
    )
  ) {
    return (
      <section className="space-y-2 px-2 py-3" aria-label="Pose controls">
        <p className="text-xs text-muted">Match the rig’s joints to show pose handles.</p>
        <button
          type="button"
          className="shell-action gap-1.5"
          onClick={() => openRigSetup(character)}
        >
          <Icon name="confirmRig" />
          Set Up Rig
        </button>
      </section>
    )
  }

  return (
    <section aria-label="Pose controls" className="space-y-2 p-1">
      <h2 className="truncate px-2 pt-1.5 font-semibold" title={character.name}>
        {character.name}
      </h2>
      {groups.map(({ name, controls }) => {
        const rows = controls.map(row).filter(Boolean)
        if (!rows.length) return null
        return (
          <div key={name} role="group" aria-label={name}>
            <h3 className="px-2 pb-0.5 text-[11px] font-medium text-muted">{name}</h3>
            {rows}
          </div>
        )
      })}
      {effector && (
        <div role="group" aria-label="Bend direction">
          <h3 className="px-2 pb-0.5 text-[11px] font-medium text-muted">Bend direction</h3>
          {row(bendControl(effector))}
        </div>
      )}
    </section>
  )
}
