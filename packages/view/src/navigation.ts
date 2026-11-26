// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Taken from Enclose, apps/desktop/src/lib/navigation.ts (github.com/enclosedev/enclose at b2da08e).
// Changed for Dilemma: presets are animation packages (Maya, Blender, and a trackpad-first
// one), the right button may zoom, and Alt drags work Maya's way under every preset. See NOTICE.md.

// What a mouse's buttons do to the view. Every program for working in three dimensions
// has its own way with them, and a hand that has learned one is slow to learn another:
// so each button can be set by itself, or all of them at once to how another program has
// them. The main button is not among them: it picks joints out, unless Alt is held.

/** What a drag does to the view. */
export type Drag = 'turn' | 'pan' | 'zoom'

/** The buttons that move the view. */
export type Button = 'middle' | 'right'

/** The keys that change what a drag does, held as it starts. */
export type Held = { shift: boolean; ctrl: boolean }

export type Buttons = {
  /** a drag with the middle button, which is the wheel pressed down */
  middle: Drag
  /** a drag with the right button */
  right: Drag
  /** a drag with either of them, with Shift held */
  shift: Drag
  /** and with Ctrl held */
  ctrl: Drag
}

export type Preset = 'maya' | 'blender' | 'trackpad'

/**
 * The buttons as programs have them. Maya's Alt drags (left turns, middle pans, right
 * zooms) work under every preset; these say what the buttons do without Alt.
 */
export const PRESETS: Record<Preset, Buttons> = {
  maya: { middle: 'pan', right: 'zoom', shift: 'pan', ctrl: 'zoom' },
  blender: { middle: 'turn', right: 'turn', shift: 'pan', ctrl: 'zoom' },
  trackpad: { middle: 'zoom', right: 'turn', shift: 'pan', ctrl: 'zoom' },
}

/** What each is called, in the order they are offered. */
export const PRESET_WORDS: Record<Preset, string> = {
  maya: 'Maya',
  blender: 'Blender',
  trackpad: 'Trackpad first',
}

const KEYS = ['middle', 'right', 'shift', 'ctrl'] as const

/** Whose buttons these are: null when they are nobody's but the user's own. */
export function presetOf(buttons: Buttons): Preset | null {
  const names = Object.keys(PRESETS) as Preset[]
  return names.find((name) => KEYS.every((key) => PRESETS[name][key] === buttons[key])) ?? null
}

/**
 * What a drag with a button does, with the keys that are held. A key says what it does
 * whichever the button, and both keys together zoom.
 */
export function dragOf(buttons: Buttons, button: Button, held: Held): Drag {
  if (held.shift && held.ctrl) return 'zoom'
  if (held.shift) return buttons.shift
  if (held.ctrl) return buttons.ctrl
  return buttons[button]
}

/** What a drag with Alt held does, as in Maya: left turns, middle pans, right zooms. */
export function altDragOf(button: 'left' | Button): Drag {
  return button === 'left' ? 'turn' : button === 'middle' ? 'pan' : 'zoom'
}

/** A drag with a button, with a key held or with none. */
export type Way = { button: Button; held: 'shift' | 'ctrl' | null }

/**
 * Every way there is to turn the view with a drag, to pan it and to zoom it: with no key
 * first. A key is said once, with a button it makes a difference to: the right one, or
 * the middle one where the right one does the same without it.
 */
export function waysOf(buttons: Buttons): Record<Drag, Way[]> {
  const ways: Record<Drag, Way[]> = { turn: [], pan: [], zoom: [] }
  for (const button of ['right', 'middle'] as const)
    ways[buttons[button]].push({ button, held: null })
  for (const held of ['shift', 'ctrl'] as const) {
    const does = buttons[held]
    const button = (['right', 'middle'] as const).find((one) => buttons[one] !== does)
    if (button) ways[does].push({ button, held })
  }
  return ways
}
