import {
  canMapJoint,
  CONTROL_LABELS,
  RIG_ROLES,
  validRigMapping,
  type Character,
  type RigRole,
} from '@dilemma/core'
import { Fragment, useEffect, useId, useRef, type Ref } from 'react'
import { useEditorState } from '../editor.ts'
import { ActionIcon } from '../icons/action.tsx'
import { Icon } from '../icons/central.tsx'
import {
  assignRigJoint,
  closeRigSetup,
  confirmRigSetupStep,
  finishRigSetup,
  openRigSetup,
  reviewStep,
  rigSetupSteps,
  skipRigSetup,
  updateRigSetup,
} from '../rig-setup.ts'
import { useUi, type RigSetupDraft } from '../ui-store.ts'
import { InspectorSelect, type InspectorSelectItem } from './inspector-select.tsx'

export function RigReviewTool() {
  const { doc, playhead, selection } = useEditorState()
  const loading = useUi((s) => s.loading)
  const setupId = useUi((s) => s.rigSetup?.characterId)
  const activeId = doc.clips.find((clip) => clip.id === playhead.clipId)?.characterId
  const preferredId = setupId ?? selection.joints[0]?.characterId ?? activeId
  const character =
    doc.characters.find(({ id }) => id === preferredId) ??
    doc.characters.find((item) => !item.rig?.confirmed) ??
    doc.characters[0]
  if (!character) return null
  const label = character.rig?.confirmed ? 'Rig Mapping' : 'Rig Setup'

  return (
    <button
      type="button"
      className="shell-icon shell-rail-icon shell-toggle"
      data-action-group="pose"
      aria-label={label}
      aria-pressed={setupId === character.id}
      title={label}
      disabled={Boolean(loading)}
      onClick={() => openRigSetup(character)}
    >
      <ActionIcon name="rigMapping" />
    </button>
  )
}

function goToStep(step: number | null) {
  updateRigSetup({ step, previewRole: null, pickRole: null, error: null })
}

export function RigSetupGuide({
  character,
  setup,
  guideRef,
  returnFocus,
}: {
  character: Character
  setup: RigSetupDraft
  guideRef: Ref<HTMLElement>
  returnFocus(): void
}) {
  const { skeleton } = character
  const { step, joints, confirmedSteps = [] } = setup
  const heading = useRef<HTMLHeadingElement>(null)
  const current = step === null ? null : rigSetupSteps[step]!
  const reviewing = step === reviewStep
  const matched = RIG_ROLES.filter((role) => joints[role] !== undefined).length
  const valid = matched > 0 && validRigMapping(skeleton, { confirmed: true, joints })
  const jointNames = new Map<string, number>()
  for (const { name } of skeleton.joints) jointNames.set(name, (jointNames.get(name) ?? 0) + 1)

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [step])

  return (
    <section
      ref={guideRef}
      aria-label="Rig setup"
      data-rig-guide
      className="rig-guide rig-guide-palette"
    >
      <header className="flex min-h-8 items-center gap-0.5 px-2">
        {current && (
          <button
            type="button"
            className="shell-action size-5 p-0"
            aria-label="Back to Rig Setup"
            title="Back to Rig Setup"
            onClick={() => goToStep(null)}
          >
            <span className="rotate-180">
              <Icon name="chevronRight" size={14} />
            </span>
          </button>
        )}
        <h2 ref={heading} tabIndex={-1} className="px-1 font-medium outline-none">
          {current?.title ?? 'Rig Setup'}
        </h2>
        <button
          type="button"
          className="shell-action ms-auto h-5 px-1.5"
          onClick={() => {
            if (character.rig?.confirmed) closeRigSetup()
            else skipRigSetup(character)
            returnFocus()
          }}
        >
          {character.rig?.confirmed ? 'Cancel' : 'Skip'}
        </button>
      </header>
      <div key={step} className="min-h-0 overflow-auto overscroll-contain px-1 pb-1">
        {!current ? (
          rigSetupSteps.map(({ title, roles }, index) => {
            const group: readonly RigRole[] = index === reviewStep ? RIG_ROLES : roles
            const count = group.filter((role) => joints[role] !== undefined).length
            const confirmed = confirmedSteps.includes(index)
            return (
              <button
                type="button"
                className="rig-guide-row"
                key={title}
                aria-description={`${confirmed ? 'Confirmed. ' : ''}${count} of ${group.length} joints matched`}
                onClick={() => goToStep(index)}
              >
                <span className="rig-guide-check" aria-hidden="true">
                  <span className="rig-guide-box" data-checked={confirmed || undefined}>
                    {confirmed && <Icon name="checkmarkFilled" size={18} />}
                  </span>
                </span>
                {title}
                <Icon name="chevronRight" size={14} className="ms-auto" />
              </button>
            )
          })
        ) : reviewing ? (
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 px-2 pt-1">
            {RIG_ROLES.map((role) => {
              const joint = joints[role]
              const name =
                joint === undefined ? 'Unmapped' : (skeleton.joints[joint]?.name ?? 'Unmapped')
              return (
                <Fragment key={role}>
                  <dt className="text-muted">{CONTROL_LABELS[role]}</dt>
                  <dd className="truncate text-right" title={name}>
                    {name}
                  </dd>
                </Fragment>
              )
            })}
          </dl>
        ) : (
          <div className="grid gap-2 px-1 pt-1 pb-1">
            {current.roles.map((role) => (
              <RigJointField
                key={role}
                role={role}
                character={character}
                setup={setup}
                jointNames={jointNames}
              />
            ))}
          </div>
        )}
      </div>
      {step !== null && (
        <button
          type="button"
          className="rig-guide-primary shell-action mt-2 me-2 mb-2 h-5 gap-0.5 justify-self-end px-1.5"
          disabled={reviewing && !valid}
          onClick={() => {
            if (reviewing) {
              finishRigSetup()
              returnFocus()
            } else confirmRigSetupStep()
          }}
        >
          {reviewing ? 'Confirm Rig' : confirmedSteps.includes(step) ? 'Next' : 'Confirm & Next'}
          {!reviewing && <Icon name="chevronRight" size={14} />}
        </button>
      )}
    </section>
  )
}

function RigJointField({
  role,
  character,
  setup,
  jointNames,
}: {
  role: RigRole
  character: Character
  setup: RigSetupDraft
  jointNames: ReadonlyMap<string, number>
}) {
  const id = useId()
  const { skeleton } = character
  const { joints, pickRole, error } = setup
  const label = CONTROL_LABELS[role]
  const picking = pickRole === role
  const items: InspectorSelectItem<string>[] = [{ value: '', label: 'Unmapped' }]
  for (const [index, { id: jointId, name, parent }] of skeleton.joints.entries()) {
    if (!canMapJoint(skeleton, role, index)) continue
    items.push({
      value: String(index),
      label:
        (jointNames.get(name) ?? 0) > 1
          ? `${name} (${skeleton.joints[parent]?.name ?? 'root'}, ${jointId})`
          : name,
      disabled: RIG_ROLES.some((other) => other !== role && joints[other] === index),
    })
  }
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="px-0.5 text-[11px] text-muted">
        {label}
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] rounded-md bg-raised">
        <InspectorSelect
          id={id}
          rigGuide
          label={label}
          items={items}
          value={String(joints[role] ?? '')}
          onFocus={() => {
            if (!pickRole) updateRigSetup({ previewRole: role, error: null })
          }}
          onChange={(next) => assignRigJoint(role, next === '' ? undefined : Number(next))}
        />
        <button
          type="button"
          title={`Pick ${label.toLowerCase()} in viewport`}
          aria-label={`Pick ${label.toLowerCase()} in viewport`}
          aria-pressed={picking}
          className="rig-guide-pick shell-action size-7 rounded-s-none border-s border-control-divider p-0"
          onClick={() =>
            updateRigSetup({ previewRole: role, pickRole: picking ? null : role, error: null })
          }
        >
          <Icon name="eyedropper" size={16} />
        </button>
      </div>
      {picking && error && (
        <p role="alert" className="px-0.5 text-[var(--rig-guide-error)]">
          {error}
        </p>
      )}
    </div>
  )
}
