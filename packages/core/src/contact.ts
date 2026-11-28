import type { Clip, EffectorPin } from './document.ts'
import { isEffector, type Effector } from './rig.ts'

export interface Contact {
  id: string
  effector: Effector
  start: number
  end: number
  /** World-space foot pose or a grip pose in the prop's local space. */
  anchor: EffectorPin
  /** Rigid transform of the contact prop in world space. */
  prop?: EffectorPin
}

export const CONTACT_TRANSITION_FRAMES = 4

export function handEffector(effector: Effector): boolean {
  return effector === 'leftHand' || effector === 'rightHand'
}

export function validPin(pin: EffectorPin): boolean {
  return (
    Array.isArray(pin.position) &&
    pin.position.length === 3 &&
    Array.isArray(pin.rotation) &&
    pin.rotation.length === 4 &&
    pin.position.every(Number.isFinite) &&
    pin.rotation.every(Number.isFinite) &&
    Math.abs(Math.hypot(...pin.rotation) - 1) < 1e-4
  )
}

export function validContacts(clip: Pick<Clip, 'start' | 'end' | 'contacts'>): boolean {
  const ids = new Set<string>()
  const ends = new Map<Effector, number>()
  for (const contact of (clip.contacts ?? []).toSorted((a, b) => a.start - b.start)) {
    const { id, effector, start, end, anchor, prop } = contact
    if (
      !id ||
      ids.has(id) ||
      !isEffector(effector) ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < clip.start ||
      end < start ||
      end > clip.end ||
      start <= (ends.get(effector) ?? -Infinity) ||
      !validPin(anchor) ||
      (handEffector(effector) ? !prop || !validPin(prop) : prop !== undefined)
    )
      return false
    ids.add(id)
    ends.set(effector, end)
  }
  return true
}

export function contactAt(clip: Clip | undefined, effector: Effector, frame: number) {
  return clip?.contacts?.find(
    (contact) => contact.effector === effector && frame >= contact.start && frame <= contact.end,
  )
}
