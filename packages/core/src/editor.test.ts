import { describe, expect, it } from 'vitest'
import { addCharacter, removeCharacter } from './commands.ts'
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
})
