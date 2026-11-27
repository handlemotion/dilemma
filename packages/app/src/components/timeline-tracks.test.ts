import type { Character, Clip, Transform } from '@dilemma/core'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIMELINE_HEIGHT,
  TRACK_HEIGHT,
  keyframeInDirection,
  timelineHeight,
  timelineRowAt,
  timelineRows,
} from './timeline-tracks.ts'

const rest: Transform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
const character: Character = {
  id: 'dancer',
  name: 'Dancer',
  source: { uri: 'dancer.gltf' },
  skeleton: {
    joints: [
      { id: 'root', name: 'Root', parent: -1, rest },
      { id: 'arm', name: 'Arm', parent: 0, rest },
      { id: 'leg', name: 'Leg', parent: 0, rest },
      { id: 'wrist', name: 'Wrist', parent: 1, rest },
      { id: 'second-root', name: 'Second Root', parent: -1, rest },
    ],
  },
}
const clip: Clip = {
  id: 'wave',
  name: 'Wave',
  characterId: character.id,
  fps: 30,
  start: 10,
  end: 60,
  tracks: [
    { joint: 2, translations: { frames: [5, 10, 20, 65], values: [] } },
    {
      joint: 3,
      rotations: { frames: [20, 32], values: [] },
      scales: { frames: [20, 36], values: [] },
    },
    { joint: 4, translations: { frames: [60], values: [] } },
  ],
}

describe('timeline tracks', () => {
  it('keeps the character summary complete while showing only each joint’s own keys', () => {
    const rows = timelineRows(character, clip)
    expect(rows.map(({ name, depth, frames }) => ({ name, depth, frames }))).toEqual([
      { name: 'Dancer', depth: 0, frames: [10, 20, 32, 36, 60] },
      { name: 'Root', depth: 1, frames: [] },
      { name: 'Arm', depth: 2, frames: [] },
      { name: 'Wrist', depth: 3, frames: [20, 32, 36] },
      { name: 'Leg', depth: 2, frames: [10, 20] },
      { name: 'Second Root', depth: 1, frames: [60] },
    ])
    expect(rows.find(({ id }) => id === 'joint:wrist')?.joint).toBe(3)
  })

  it('resolves rows correctly at the pinned summary boundary and after a partial scroll', () => {
    const rows = timelineRows(character, clip)
    const scroll = TRACK_HEIGHT + 12
    expect(timelineRowAt(rows, -1, scroll)).toBeUndefined()
    expect(timelineRowAt(rows, TRACK_HEIGHT - 1, scroll)?.id).toBe('character')
    expect(timelineRowAt(rows, TRACK_HEIGHT, scroll)?.id).toBe('joint:arm')
    expect(timelineRowAt(rows, TRACK_HEIGHT * 2 - 12, scroll)?.id).toBe('joint:wrist')
    expect(timelineRowAt(rows, TRACK_HEIGHT * rows.length - scroll, scroll)).toBeUndefined()
    expect(timelineRowAt(rows.slice(0, 1), TRACK_HEIGHT, 0)).toBeUndefined()
  })

  it('keeps a joint row visible when expanding a timeline previously resized to compact height', () => {
    expect(timelineHeight(70, false)).toBe(DEFAULT_TIMELINE_HEIGHT)
    expect(timelineHeight(70, true)).toBe(DEFAULT_TIMELINE_HEIGHT + 4 * TRACK_HEIGHT)
    expect(timelineHeight(70, true, DEFAULT_TIMELINE_HEIGHT)).toBe(
      DEFAULT_TIMELINE_HEIGHT + TRACK_HEIGHT,
    )
    expect(timelineHeight(2, true, 200)).toBe(200)
  })
})

describe('keyframe navigation', () => {
  it('jumps to the nearest distinct key in the requested direction, within clip bounds', () => {
    expect(keyframeInDirection(clip, 20, 1, [])).toBe(32)
    expect(keyframeInDirection(clip, 20, -1, [])).toBe(10)
    expect(keyframeInDirection(clip, 36, 1, [])).toBe(60)
    expect(keyframeInDirection(clip, 10, -1, [])).toBeUndefined()
    expect(keyframeInDirection(clip, 60, 1, [])).toBeUndefined()
  })

  it('uses selected joints in the active character and leaves the playhead put for unkeyed joints', () => {
    const wrist = { characterId: character.id, joint: 3 }
    const leg = { characterId: character.id, joint: 2 }
    expect(keyframeInDirection(clip, 25, 1, [leg, wrist])).toBe(32)
    expect(keyframeInDirection(clip, 36, 1, [wrist])).toBeUndefined()
    expect(keyframeInDirection(clip, 25, 1, [{ ...wrist, joint: 1 }])).toBeUndefined()
    expect(keyframeInDirection(clip, 25, 1, [{ ...leg, characterId: 'other' }])).toBe(32)
  })
})
