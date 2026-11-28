import {
  canMapJoint,
  CONTROL_LABELS,
  RIG_ROLES,
  setRigMapping,
  suggestRig,
  validRigMapping,
  type Character,
  type JointRef,
  type RigMapping,
  type RigRole,
} from '@dilemma/core'
import { selectJoints } from './animation.ts'
import { editor } from './editor.ts'
import { useUi, type RigSetupDraft } from './ui-store.ts'

export const rigSetupSteps = [
  {
    title: 'Body',
    focusHeight: 0.74,
    roles: ['hips', 'chest', 'head'],
  },
  {
    title: 'Hands',
    focusHeight: 0.59,
    roles: ['leftHand', 'rightHand'],
  },
  {
    title: 'Feet',
    focusHeight: 0.12,
    roles: ['leftFoot', 'rightFoot'],
  },
  { title: 'Review', focusHeight: null, roles: [] },
] as const satisfies readonly {
  title: string
  focusHeight: number | null
  roles: readonly RigRole[]
}[]

export const reviewStep = rigSetupSteps.length - 1

export function openRigSetup(character: Character): void {
  const ui = useUi.getState()
  if (ui.rigSetup?.characterId === character.id) return
  ui.setPlaying(false)
  const joints = (character.rig?.confirmed ? character.rig : suggestRig(character.skeleton)).joints
  useUi.setState({
    rigSetup: {
      characterId: character.id,
      step: null,
      confirmedSteps: character.rig?.confirmed
        ? rigSetupSteps.flatMap(({ roles }, index) =>
            index === reviewStep || roles.some((role) => joints[role] !== undefined) ? [index] : [],
          )
        : [],
      joints: { ...joints },
      previewRole: null,
      pickRole: null,
      error: null,
    },
  })
}

export function closeRigSetup(): void {
  useUi.setState({ rigSetup: null })
}

export function skipRigSetup(character: Character): void {
  closeRigSetup()
  useUi.getState().setTransformMode('rotate')
  selectJoints([{ characterId: character.id, joint: 0 }])
}

export function updateRigSetup(
  patch: Partial<Omit<RigSetupDraft, 'characterId' | 'joints'>>,
): void {
  useUi.setState(({ rigSetup }) => (rigSetup ? { rigSetup: { ...rigSetup, ...patch } } : {}))
}

export function confirmRigSetupStep(): void {
  const setup = useUi.getState().rigSetup
  if (!setup || setup.step === null || setup.step === reviewStep) return
  const { step, confirmedSteps } = setup
  updateRigSetup({
    step: step + 1,
    confirmedSteps: confirmedSteps.includes(step) ? confirmedSteps : [...confirmedSteps, step],
    previewRole: null,
    pickRole: null,
    error: null,
  })
}

export function assignRigJoint(role: RigRole, joint: number | undefined): void {
  const { rigSetup } = useUi.getState()
  const character = editor
    .getState()
    .doc.characters.find((item) => item.id === rigSetup?.characterId)
  if (!character || !rigSetup) return
  if (joint !== undefined && !canMapJoint(character.skeleton, role, joint)) {
    updateRigSetup({
      error: `Choose a joint that can drive the ${CONTROL_LABELS[role].toLowerCase()}.`,
    })
    return
  }
  const owner = RIG_ROLES.find((other) => other !== role && rigSetup.joints[other] === joint)
  if (joint !== undefined && owner) {
    updateRigSetup({
      error: `That joint is already assigned to ${CONTROL_LABELS[owner].toLowerCase()}.`,
    })
    return
  }
  const joints = { ...rigSetup.joints }
  if (joint === undefined) delete joints[role]
  else joints[role] = joint
  const group = rigSetupSteps.findIndex(({ roles }) => roles.some((entry) => entry === role))
  const confirmedSteps =
    joint === rigSetup.joints[role]
      ? rigSetup.confirmedSteps
      : rigSetup.confirmedSteps.filter((step) => step !== group && step !== reviewStep)
  useUi.setState({
    rigSetup: {
      ...rigSetup,
      joints,
      confirmedSteps,
      previewRole: role,
      pickRole: null,
      error: null,
    },
  })
}

export function pickRigJoint(ref: JointRef): void {
  const { rigSetup } = useUi.getState()
  if (rigSetup?.pickRole && ref.characterId === rigSetup.characterId) {
    assignRigJoint(rigSetup.pickRole, ref.joint)
  }
}

export function finishRigSetup(): void {
  const { rigSetup } = useUi.getState()
  const character = editor
    .getState()
    .doc.characters.find((item) => item.id === rigSetup?.characterId)
  if (!character || !rigSetup) return
  const { joints } = rigSetup
  const rig: RigMapping = { confirmed: true, joints }
  const first = RIG_ROLES.find((role) => joints[role] !== undefined)
  if (!first || !validRigMapping(character.skeleton, rig)) return
  if (
    !character.rig?.confirmed ||
    RIG_ROLES.some((role) => character.rig?.joints[role] !== joints[role])
  ) {
    editor.run(setRigMapping(character.id, rig))
  }
  closeRigSetup()
  useUi.getState().setTransformMode('ik')
  selectJoints([{ characterId: character.id, joint: joints[first]!, control: first }])
}
