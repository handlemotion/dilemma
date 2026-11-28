import type { Clip, Contact } from '@dilemma/core'

export type ContactDragMode = 'move' | 'start' | 'end'

export function contactBounds(clip: Clip, contact: Contact) {
  let start = clip.start
  let end = clip.end
  for (const other of clip.contacts ?? []) {
    if (other.id === contact.id || other.effector !== contact.effector) continue
    if (other.end < contact.start) start = Math.max(start, other.end + 1)
    if (other.start > contact.end) end = Math.min(end, other.start - 1)
  }
  return { start, end }
}

export function dragContact(clip: Clip, contact: Contact, mode: ContactDragMode, delta: number) {
  const bounds = contactBounds(clip, contact)
  if (mode === 'start')
    return {
      ...contact,
      start: Math.min(contact.end, Math.max(bounds.start, contact.start + delta)),
    }
  if (mode === 'end')
    return { ...contact, end: Math.max(contact.start, Math.min(bounds.end, contact.end + delta)) }
  const shift = Math.max(bounds.start - contact.start, Math.min(bounds.end - contact.end, delta))
  return { ...contact, start: contact.start + shift, end: contact.end + shift }
}
