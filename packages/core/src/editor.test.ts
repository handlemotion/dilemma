import { describe, expect, it } from 'vitest'
import {
  addCharacter,
  deleteClipKeys,
  deleteRotationKeys,
  deleteTransformKeys,
  removeCharacter,
  setClipTiming,
  setLimbTargetKey,
  setRotationKey,
  setSceneTiming,
  setTransformKey,
  setTransformKeys,
} from './commands.ts'
import { emptyDocument, type Character, type Clip } from './document.ts'
import { Editor } from './editor.ts'
import { DocumentVersionError, migrate } from './migrate.ts'

function character(id: string, joints = 3): Character {
  return {
    id,
    name: id,
    source: { uri: `${id}.glb` },
    skeleton: {
      joints: Array.from({ length: joints }, (_, i) => ({
        id: `j${i}`,
        name: `joint${i}`,
        parent: i - 1,
        rest: { translation: [0, i, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      })),
    },
  }
}

function clip(id: string, characterId: string): Clip {
  return { id, name: id, characterId, fps: 30, start: 0, end: 10, tracks: [] }
}

/** Deterministic PRNG so the random-command test is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Editor', () => {
  it('changes clip timing without moving keys and clamps the playhead through undo and redo', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a'), [clip('walk', 'a')]))
    editor.run(setRotationKey('walk', 0, 4, [0, 0, 0, 1]))
    editor.run(setLimbTargetKey('walk', 2, 8, [1, 2, 3]))
    const before = editor.getState().doc

    expect(() => editor.run(setClipTiming('walk', { start: 5 }))).toThrow('include all keys')
    expect(() => editor.run(setClipTiming('walk', { end: 7 }))).toThrow('include all keys')
    expect(() => editor.run(setClipTiming('walk', { fps: 0 }))).toThrow('greater than zero')
    expect(editor.getState().doc).toBe(before)

    editor.setPlayhead({ frame: 10 })
    editor.run(setClipTiming('walk', { start: 2, end: 8, fps: 29.97 }))
    const revised = editor.getState().doc.clips[0]!
    expect(revised).toEqual({ ...before.clips[0], start: 2, end: 8, fps: 29.97 })
    expect(migrate(editor.getState().doc).clips[0]).toEqual(revised)
    expect(editor.getState().playhead.frame).toBe(8)

    editor.undo()
    expect(editor.getState().doc).toEqual(before)
    editor.setPlayhead({ frame: 0 })
    editor.redo()
    expect(editor.getState().doc.clips[0]).toEqual(revised)
    expect(editor.getState().playhead.frame).toBe(2)
  })

  it('undoes and redoes through the command log', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a'), [clip('c1', 'a')]))
    expect(editor.getState().doc.characters).toHaveLength(1)
    expect(editor.getState().playhead.clipId).toBe('c1')
    editor.undo()
    expect(editor.getState().doc).toEqual(emptyDocument())
    expect(editor.getState().playhead.clipId).toBeNull()
    editor.redo()
    expect(editor.getState().doc.clips[0]?.id).toBe('c1')
  })

  it('returns to the exact starting document after random commands and as many undos', () => {
    const random = mulberry32(7)
    const editor = new Editor()
    editor.run(addCharacter(character('base'), [clip('base-clip', 'base')]))
    const start = JSON.parse(JSON.stringify(editor.getState().doc))
    let next = 0
    let ran = 0
    while (ran < 200) {
      const ids = editor.getState().doc.characters.map((c) => c.id)
      if (ids.length > 0 && random() < 0.4) {
        editor.run(removeCharacter(ids[Math.floor(random() * ids.length)]!))
      } else {
        const id = `c${next++}`
        editor.run(
          addCharacter(character(id, 1 + Math.floor(random() * 5)), [clip(`${id}-clip`, id)]),
        )
      }
      ran++
    }
    for (let i = 0; i < 200; i++) expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(start)
  })

  it('keys independent transform channels and undoes their deletion in one step', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a'), [clip('walk', 'a')]))
    editor.run(setTransformKey('walk', 0, 2, { channel: 'translations', value: [1, 2, 3] }))
    editor.run(setRotationKey('walk', 0, 5, [0, 0, 0, 1]))
    editor.run(setTransformKey('walk', 0, 5, { channel: 'scales', value: [2, 3, 4] }))
    editor.run(setTransformKey('walk', 0, 2, { channel: 'translations', value: [4, 5, 6] }))
    const keyed = editor.getState().doc
    expect(keyed.clips[0]?.tracks).toEqual([
      {
        joint: 0,
        translations: { frames: [2], values: [4, 5, 6] },
        rotations: { frames: [5], values: [0, 0, 0, 1] },
        scales: { frames: [5], values: [2, 3, 4] },
      },
    ])

    editor.run(deleteTransformKeys('walk', [0], 5, 5))
    expect(editor.getState().doc.clips[0]?.tracks).toEqual([
      { joint: 0, translations: { frames: [2], values: [4, 5, 6] } },
    ])
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(keyed)
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc.clips[0]?.tracks[0]?.translations?.values).toEqual([1, 2, 3])
  })

  it('keys several selected joints at one frame as one undoable edit', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a'), [clip('walk', 'a')]))
    const before = editor.getState().doc
    editor.run(
      setTransformKeys('walk', 5, [
        { joint: 0, key: { channel: 'translations', value: [1, 2, 3] } },
        { joint: 2, key: { channel: 'translations', value: [4, 5, 6] } },
      ]),
    )
    expect(editor.getState().doc.clips[0]?.tracks).toEqual([
      { joint: 0, translations: { frames: [5], values: [1, 2, 3] } },
      { joint: 2, translations: { frames: [5], values: [4, 5, 6] } },
    ])
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(before)
  })

  it('undoes the first transform key and its newly created clip together', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a')))
    const before = editor.getState().doc
    editor.run(setTransformKey(clip('walk', 'a'), 0, 7, { channel: 'scales', value: [2, 2, 2] }))
    expect(editor.getState().doc.clips[0]?.tracks[0]?.scales?.frames).toEqual([7])
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(before)
  })

  it('drops selected joints that no longer exist', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a')))
    editor.select([{ characterId: 'a', joint: 2 }])
    editor.undo()
    expect(editor.getState().selection.joints).toEqual([])
  })

  it('keeps the playhead on integer frames', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a'), [clip('c', 'a')]))
    editor.setPlayhead({ frame: 4.6 })
    expect(editor.getState().playhead.frame).toBe(5)
  })
})

describe('migrate', () => {
  it('accepts the current version and rejects unknown ones', () => {
    expect(migrate(emptyDocument())).toEqual(emptyDocument())
    expect(() => migrate({ version: 99 })).toThrow(DocumentVersionError)
    expect(() => migrate({})).toThrow(DocumentVersionError)
    expect(() => migrate(null)).toThrow(DocumentVersionError)
  })

  it('round trips through JSON', () => {
    const editor = new Editor()
    editor.run(addCharacter(character('a'), [clip('c', 'a')]))
    const doc = editor.getState().doc
    expect(migrate(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })

  it('loads version-three projects and saves undoable scene defaults alongside their authored clips', () => {
    const raw = { version: 3, characters: [character('a')], clips: [clip('walk', 'a')] }
    const doc = migrate(raw)
    expect(doc.sceneTiming).toEqual({ fps: 30, start: 0, end: 120 })
    expect(doc.clips).toEqual(raw.clips)

    const editor = new Editor(doc)
    const sceneTiming = { fps: 23.976, start: -12, end: 48 }
    editor.run(setSceneTiming(sceneTiming))
    expect(() => editor.run(setSceneTiming({ end: -13 }))).toThrow()
    expect(migrate(JSON.parse(JSON.stringify(editor.getState().doc)))).toEqual({
      ...doc,
      sceneTiming,
    })
    expect(editor.getState().doc.clips).toBe(doc.clips)
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(doc)
    expect(editor.redo()).toBe(true)
    expect(editor.getState().doc.sceneTiming).toEqual(sceneTiming)
  })

  it('loads a version-two FK clip and round trips its new undoable IK keys', () => {
    const characterId = 'a'
    const raw = {
      version: 2,
      characters: [character(characterId)],
      clips: [
        {
          ...clip('walk', characterId),
          tracks: [{ joint: 2, translations: { frames: [4], values: [0, 2, 0] } }],
        },
      ],
    }
    const doc = migrate(raw)
    expect(doc.clips).toEqual(raw.clips)
    const editor = new Editor(doc)
    editor.run(setLimbTargetKey('walk', 2, 4, [1, 2, 3]))
    const keyed = migrate(JSON.parse(JSON.stringify(editor.getState().doc)))
    expect(keyed.clips[0]?.limb).toEqual({ tip: 2, targets: { frames: [4], values: [1, 2, 3] } })
    editor.run(deleteClipKeys('walk', [], 4, 4, { limb: true }))
    expect(editor.getState().doc).toEqual(doc)
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(keyed)
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(doc)
  })

  it('loads shared version-one key times and preserves translation through rotation edits and undo', () => {
    const frames = [0, 10]
    const values = [0, 0, 0, 10, 0, 0]
    const raw = {
      version: 1,
      characters: [character('a')],
      clips: [
        {
          ...clip('walk', 'a'),
          tracks: [{ joint: 0, frames, translations: values, rotations: [0, 0, 0, 1, 0, 0, 1, 0] }],
        },
      ],
    }
    const doc = migrate(JSON.parse(JSON.stringify(raw)))
    expect(doc.clips[0]?.tracks[0]?.rotations?.frames).toEqual(frames)
    const editor = new Editor(doc)
    editor.run(setRotationKey('walk', 0, 5, [0, Math.SQRT1_2, 0, Math.SQRT1_2]))
    expect(editor.getState().doc.clips[0]?.tracks[0]?.rotations?.frames).toEqual([0, 5, 10])
    editor.run(deleteRotationKeys('walk', [0], 0, 10))
    expect(editor.getState().doc.clips[0]?.tracks).toEqual([
      { joint: 0, translations: { frames, values } },
    ])
    expect(editor.undo()).toBe(true)
    expect(editor.undo()).toBe(true)
    expect(editor.getState().doc).toEqual(doc)
  })
})
