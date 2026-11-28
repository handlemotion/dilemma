import { addCharacter, emptyDocument, type Character } from '@dilemma/core'
import { afterEach, expect, it } from 'vitest'
import { editor } from './editor.ts'
import {
  assignRigJoint,
  closeRigSetup,
  confirmRigSetupStep,
  finishRigSetup,
  openRigSetup,
  pickRigJoint,
  reviewStep,
  updateRigSetup,
} from './rig-setup.ts'
import { useUi } from './ui-store.ts'

const character: Character = {
  id: 'asset',
  name: 'Character',
  source: { uri: 'asset.glb' },
  skeleton: {
    joints: ['pelvis', 'j1', 'j2', 'j3'].map((name, index) => ({
      id: `j${index}`,
      name,
      parent: index - 1,
      rest: { translation: [0, 0.3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    })),
  },
}

afterEach(() => {
  editor.load(emptyDocument())
  useUi.setState(useUi.getInitialState())
})

it('keeps partial rig setup in the draft until a single undoable confirmation', () => {
  editor.run(addCharacter(character))
  const imported = editor.getState().doc
  openRigSetup(character)
  assignRigJoint('chest', 0)
  expect(useUi.getState().rigSetup?.error).toContain('already assigned')
  updateRigSetup({ pickRole: 'leftFoot' })
  pickRigJoint({ characterId: character.id, joint: 1 })
  expect(useUi.getState().rigSetup?.pickRole).toBe('leftFoot')
  expect(useUi.getState().rigSetup?.joints.leftFoot).toBeUndefined()
  pickRigJoint({ characterId: character.id, joint: 3 })
  expect(useUi.getState().rigSetup?.joints).toEqual({ hips: 0, leftFoot: 3 })
  expect(editor.getState().doc).toBe(imported)
  finishRigSetup()
  expect(editor.getState().doc.characters[0]?.rig).toEqual({
    confirmed: true,
    joints: { hips: 0, leftFoot: 3 },
  })
  expect(useUi.getState().rigSetup).toBeNull()
  expect(editor.getState().selection.joints[0]?.control).toBe('hips')
  expect(editor.undo()).toBe(true)
  expect(editor.getState().doc).toEqual(imported)
})

it('discarding revised matches preserves the saved rig, and undoing import closes setup', () => {
  const confirmed: Character = {
    ...character,
    rig: { confirmed: true, joints: { hips: 0, leftFoot: 3 } },
  }
  editor.run(addCharacter(confirmed))
  const before = editor.getState().doc
  openRigSetup(confirmed)
  assignRigJoint('leftFoot', undefined)
  closeRigSetup()
  expect(editor.getState().doc).toBe(before)
  openRigSetup(confirmed)
  expect(useUi.getState().rigSetup?.joints.leftFoot).toBe(3)
  expect(useUi.getState().rigSetup?.confirmedSteps).toEqual([0, 2, reviewStep])
  assignRigJoint('leftFoot', undefined)
  expect(useUi.getState().rigSetup?.confirmedSteps).toEqual([0])
  expect(editor.undo()).toBe(true)
  expect(useUi.getState().rigSetup).toBeNull()
})

it('confirms the current section and advances only when a section is open', () => {
  editor.run(addCharacter(character))
  openRigSetup(character)
  expect(useUi.getState().rigSetup?.joints.hips).toBe(0)
  confirmRigSetupStep()
  expect(useUi.getState().rigSetup?.confirmedSteps).toEqual([])
  assignRigJoint('leftFoot', 3)
  updateRigSetup({ step: 0 })
  confirmRigSetupStep()
  expect(useUi.getState().rigSetup).toMatchObject({ confirmedSteps: [0], step: 1 })
  updateRigSetup({ step: 2 })
  confirmRigSetupStep()
  confirmRigSetupStep()
  expect(useUi.getState().rigSetup).toMatchObject({ confirmedSteps: [0, 2], step: reviewStep })
  assignRigJoint('leftFoot', 3)
  expect(useUi.getState().rigSetup?.confirmedSteps).toEqual([0, 2])
  assignRigJoint('leftFoot', undefined)
  expect(useUi.getState().rigSetup?.confirmedSteps).toEqual([0])
})
