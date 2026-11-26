// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Taken from Enclose, apps/desktop/src/lib/navigation.test.ts (github.com/enclosedev/enclose at b2da08e).
// Changed for Dilemma: the presets it checks, and Alt drags. See NOTICE.md.

import { describe, expect, it } from 'vitest'
import {
  altDragOf,
  dragOf,
  presetOf,
  PRESETS,
  waysOf,
  type Buttons,
  type Preset,
} from './navigation.ts'

const NONE = { shift: false, ctrl: false }
const SHIFT = { shift: true, ctrl: false }
const CTRL = { shift: false, ctrl: true }

describe('presetOf', () => {
  it("knows each program's buttons for that program's", () => {
    for (const name of Object.keys(PRESETS) as Preset[])
      expect(presetOf({ ...PRESETS[name] })).toBe(name)
  })

  it("takes buttons set by hand for nobody's", () => {
    const own: Buttons = { ...PRESETS.blender, right: 'pan' }
    expect(presetOf(own)).toBeNull()
  })
})

describe('dragOf', () => {
  it('does what the button is set to do, with no key held', () => {
    expect(dragOf(PRESETS.maya, 'right', NONE)).toBe('zoom')
    expect(dragOf(PRESETS.maya, 'middle', NONE)).toBe('pan')
    expect(dragOf(PRESETS.trackpad, 'right', NONE)).toBe('turn')
  })

  it('does what a key says with either button', () => {
    expect(dragOf(PRESETS.blender, 'middle', SHIFT)).toBe('pan')
    expect(dragOf(PRESETS.blender, 'right', SHIFT)).toBe('pan')
    expect(dragOf(PRESETS.blender, 'middle', CTRL)).toBe('zoom')
  })

  it('zooms with both keys held, whatever each says alone', () => {
    for (const name of Object.keys(PRESETS) as Preset[])
      expect(dragOf(PRESETS[name], 'middle', { shift: true, ctrl: true })).toBe('zoom')
  })
})

describe('altDragOf', () => {
  it("drags Maya's way", () => {
    expect(altDragOf('left')).toBe('turn')
    expect(altDragOf('middle')).toBe('pan')
    expect(altDragOf('right')).toBe('zoom')
  })
})

describe('waysOf', () => {
  it('lists what each button does, the right one first', () => {
    expect(waysOf(PRESETS.blender).turn).toEqual([
      { button: 'right', held: null },
      { button: 'middle', held: null },
    ])
  })

  it('says a key with the right button, where that makes a difference', () => {
    const ways = waysOf(PRESETS.trackpad)
    expect(ways.turn).toEqual([{ button: 'right', held: null }])
    expect(ways.pan).toEqual([{ button: 'right', held: 'shift' }])
    expect(ways.zoom).toEqual([
      { button: 'middle', held: null },
      { button: 'right', held: 'ctrl' },
    ])
  })

  it('leaves out a key that changes nothing', () => {
    const all: Buttons = { middle: 'pan', right: 'pan', shift: 'pan', ctrl: 'zoom' }
    expect(waysOf(all).pan).toEqual([
      { button: 'right', held: null },
      { button: 'middle', held: null },
    ])
    expect(waysOf(all).turn).toEqual([])
  })
})
