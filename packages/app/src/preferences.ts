// Copyright (C) 2026 Glauber. Licensed AGPL-3.0-only.
// Taken from Enclose, apps/desktop/src/lib/preferences.ts (github.com/enclosedev/enclose at b2da08e).
// Changed for Dilemma: only how the view answers the hand is kept (the rest was the
// other app's own), and the defaults are Maya's buttons. See NOTICE.md.

// What the user has chosen about how the view answers the hand. These are the window's
// own, kept in its storage.
import {
  DEFAULT_NAVIGATION,
  TURN_SPEED,
  ZOOM_SPEED,
  type Drag,
  type NavigationPreferences,
} from '@dilemma/view'
import { create } from 'zustand'

export type Preferences = NavigationPreferences

const DEFAULTS: Preferences = DEFAULT_NAVIGATION
const KEY = 'dilemma:preferences'

const isDrag = (read: unknown): read is Drag => read === 'turn' || read === 'pan' || read === 'zoom'
/** A speed that was kept, within what it may be: or the speed it comes with. */
const speed = (read: unknown, { min, max }: { min: number; max: number }) =>
  typeof read === 'number' && Number.isFinite(read) ? Math.min(max, Math.max(min, read)) : 1

export function readPreferences(text: string | null): Preferences {
  try {
    const read = JSON.parse(text ?? '{}') as Partial<Preferences>
    return {
      scrolling:
        read.scrolling === 'trackpad' || read.scrolling === 'wheel'
          ? read.scrolling
          : DEFAULTS.scrolling,
      middle: isDrag(read.middle) ? read.middle : DEFAULTS.middle,
      right: isDrag(read.right) ? read.right : DEFAULTS.right,
      shift: isDrag(read.shift) ? read.shift : DEFAULTS.shift,
      ctrl: isDrag(read.ctrl) ? read.ctrl : DEFAULTS.ctrl,
      turnSpeed: speed(read.turnSpeed, TURN_SPEED),
      zoomSpeed: speed(read.zoomSpeed, ZOOM_SPEED),
      wheelReversed: read.wheelReversed === true,
      pivot: read.pivot === 'view' ? 'view' : DEFAULTS.pivot,
    }
  } catch {
    return DEFAULTS
  }
}

function saved(): Preferences {
  try {
    return readPreferences(localStorage.getItem(KEY))
  } catch {
    return DEFAULTS
  }
}

export const usePreferences = create<Preferences & { change(patch: Partial<Preferences>): void }>()(
  (set, get) => ({
    ...saved(),
    change(patch) {
      set(patch)
      const kept = Object.fromEntries(Object.entries(get()).filter(([key]) => key in DEFAULTS))
      localStorage.setItem(KEY, JSON.stringify(kept))
    },
  }),
)

/** Just the preferences, without the store's own functions. */
export function navigationOf(state: Preferences): NavigationPreferences {
  return readPreferences(JSON.stringify(state))
}
