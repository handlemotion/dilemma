import { emptyDocument, setSceneTiming, type Character, type TransformKey } from '@dilemma/core'
import { afterEach, expect, it } from 'vitest'
import { activeClip, beginTransform, keySelection, selectJoints } from './animation.ts'
import { editor } from './editor.ts'
import { useUi } from './ui-store.ts'

afterEach(() => {
  editor.load(emptyDocument())
  useUi.setState(useUi.getInitialState())
})

it('keeps manual pose edits off the timeline until keyed and discards them on seek', () => {
  const character: Character = {
    id: 'rig',
    name: 'Rig',
    source: { uri: 'rig.glb' },
    skeleton: {
      joints: [
        {
          id: 'root',
          name: 'Root',
          parent: -1,
          rest: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
      ],
    },
  }
  const joint = { characterId: character.id, joint: 0 }
  editor.load({ ...emptyDocument(), characters: [character] })
  selectJoints([joint])
  const ui = useUi.getState()
  ui.setAutoKey(false)
  const sceneTiming = { fps: 24, start: 7, end: 48 }
  editor.run(setSceneTiming(sceneTiming))

  function pose(key: TransformKey) {
    const edit = beginTransform(joint)
    edit.preview(key)
    edit.finish(true)
  }

  pose({ channel: 'translations', value: [1, 2, 3] })
  pose({ channel: 'scales', value: [2, 2, 2] })
  expect(activeClip()).toBeUndefined()

  keySelection()
  expect(activeClip()).toMatchObject(sceneTiming)
  expect(activeClip()?.tracks).toEqual([
    {
      joint: 0,
      translations: { frames: [7], values: [1, 2, 3] },
      scales: { frames: [7], values: [2, 2, 2] },
    },
  ])
  expect(useUi.getState().unkeyedTransforms).toHaveLength(0)

  pose({ channel: 'translations', value: [10, 20, 30] })
  editor.setPlayhead({ frame: 8 })
  keySelection()
  expect(activeClip()?.tracks[0]?.translations).toEqual({ frames: [7], values: [1, 2, 3] })
  expect(activeClip()?.tracks[0]?.rotations?.frames).toEqual([8])
  expect(editor.undo()).toBe(true)
  expect(editor.undo()).toBe(true)
  expect(activeClip()).toBeUndefined()
})
