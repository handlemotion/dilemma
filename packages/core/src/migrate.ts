import { validContacts, type Contact } from './contact.ts'
import {
  DEFAULT_SCENE_TIMING,
  DOCUMENT_VERSION,
  limbRoot,
  validSceneTiming,
  type DilemmaDocument,
  type Skeleton,
} from './document.ts'
import { CONTROL_IDS, controlKind, EFFECTORS, validRigMapping, type RigMapping } from './rig.ts'
import { validAxisCurves } from './curves.ts'

/**
 * One migration per version. `migrations[n]` upgrades a version-n document to
 * version n + 1. Add an entry here every time DOCUMENT_VERSION goes up, and a
 * test that loads a stored document of the old version.
 */
const channels = ['translations', 'rotations', 'scales'] as const

const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  1: (doc) => ({
    ...doc,
    clips: array(doc['clips']).map((rawClip) => {
      const clip = object(rawClip)
      return {
        ...clip,
        tracks: array(clip['tracks']).map((rawTrack) => {
          const track = object(rawTrack)
          const next: Record<string, unknown> = { joint: track['joint'] }
          for (const channel of channels) {
            if (track[channel] !== undefined) {
              next[channel] = { frames: track['frames'], values: track[channel] }
            }
          }
          return next
        }),
      }
    }),
  }),
  // Version 3 adds an optional IK target track. Existing clips are FK.
  2: (doc) => doc,
  3: (doc) => ({ ...doc, sceneTiming: { ...DEFAULT_SCENE_TIMING } }),
  // Version 5 adds optional rig mappings, control tracks and pins.
  4: (doc) => doc,
  // Version 6 adds optional contact clips. Whole-clip pins retain their behavior.
  5: (doc) => doc,
  // Version 7 adds independently timed axis curves. Sampled channels keep their interpolation.
  6: (doc) => doc,
}

export class DocumentVersionError extends Error {}

export function migrate(raw: unknown): DilemmaDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DocumentVersionError('A Dilemma document must be an object.')
  }
  let doc = raw as Record<string, unknown>
  let version = doc['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DocumentVersionError(`Unknown document version: ${String(version)}`)
  }
  if (version > DOCUMENT_VERSION) {
    throw new DocumentVersionError(
      `This document is version ${version}; this build reads up to ${DOCUMENT_VERSION}.`,
    )
  }
  while (version < DOCUMENT_VERSION) {
    const step = migrations[version]
    if (!step) throw new DocumentVersionError(`No migration from version ${version}.`)
    version += 1
    doc = { ...step(doc), version }
  }
  validateDocument(doc)
  return doc as unknown as DilemmaDocument
}

function invalid(): never {
  throw new DocumentVersionError(
    'The project contains invalid scene, character, or animation data.',
  )
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid()
  return value
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value) invalid()
  return value
}

function integer(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < -0x80000000 ||
    value > 0x7fffffff
  )
    invalid()
  return value
}

function numbers(value: unknown, length: number): void {
  const values = array(value)
  if (values.length !== length || values.some((number) => !Number.isFinite(number))) invalid()
}

function validateChannel(
  raw: unknown,
  width: number,
  start: number,
  end: number,
  allowCurves = true,
): number {
  const channel = object(raw)
  if (channel['curves'] !== undefined) {
    if (
      !allowCurves ||
      channel['frames'] !== undefined ||
      channel['values'] !== undefined ||
      !validAxisCurves(channel['curves'], start, end)
    )
      invalid()
    return 1
  }
  const frames = array(channel['frames'])
  let previous = -Infinity
  for (const value of frames) {
    const frame = integer(value)
    if (frame <= previous || frame < start || frame > end) invalid()
    previous = frame
  }
  numbers(channel['values'], frames.length * width)
  return frames.length
}

function validateContactTransform(value: unknown): void {
  const transform = object(value)
  numbers(transform['position'], 3)
  numbers(transform['rotation'], 4)
}

function validateDocument(doc: Record<string, unknown>): void {
  const { fps: sceneFps, start: sceneStart, end: sceneEnd } = object(doc['sceneTiming'])
  if (
    typeof sceneFps !== 'number' ||
    typeof sceneStart !== 'number' ||
    typeof sceneEnd !== 'number' ||
    !validSceneTiming({ fps: sceneFps, start: sceneStart, end: sceneEnd })
  ) {
    invalid()
  }
  const skeletons = new Map<string, number[]>()
  for (const raw of array(doc['characters'])) {
    const character = object(raw)
    const id = string(character['id'])
    string(character['name'])
    string(object(character['source'])['uri'])
    const joints = array(object(character['skeleton'])['joints'])
    if (skeletons.has(id) || joints.length === 0) invalid()
    const parents = joints.map((rawJoint, index) => {
      const joint = object(rawJoint)
      string(joint['id'])
      string(joint['name'])
      const parent = integer(joint['parent'])
      if (parent < -1 || parent >= index) invalid()
      const rest = object(joint['rest'])
      numbers(rest['translation'], 3)
      numbers(rest['rotation'], 4)
      numbers(rest['scale'], 3)
      return parent
    })
    if (character['rig'] !== undefined) {
      const rig = object(character['rig'])
      if (typeof rig['confirmed'] !== 'boolean') invalid()
      object(rig['joints'])
      if (!validRigMapping({ joints } as Skeleton, rig as unknown as RigMapping)) invalid()
    }
    skeletons.set(id, parents)
  }
  const ids = new Set<string>()
  for (const raw of array(doc['clips'])) {
    const clip = object(raw)
    const id = string(clip['id'])
    const parents = skeletons.get(string(clip['characterId']))
    string(clip['name'])
    const start = integer(clip['start'])
    const end = integer(clip['end'])
    const fps = clip['fps']
    if (ids.has(id) || !parents || end < start || !Number.isFinite(fps) || Number(fps) <= 0) {
      invalid()
    }
    ids.add(id)
    const joints = new Set<number>()
    for (const rawTrack of array(clip['tracks'])) {
      const track = object(rawTrack)
      const joint = integer(track['joint'])
      if (joint < 0 || joint >= parents.length || joints.has(joint)) invalid()
      joints.add(joint)
      for (const name of channels) {
        if (track[name] === undefined) continue
        validateChannel(track[name], name === 'rotations' ? 4 : 3, start, end)
      }
    }
    if (clip['controls'] !== undefined) {
      for (const [name, channel] of Object.entries(object(clip['controls']))) {
        const control = CONTROL_IDS.find((entry) => entry === name)
        if (
          !control ||
          !validateChannel(channel, controlKind(control) === 'rotation' ? 4 : 3, start, end, false)
        )
          invalid()
      }
    }
    if (clip['pins'] !== undefined) {
      for (const [name, rawPin] of Object.entries(object(clip['pins']))) {
        if (!EFFECTORS.some((effector) => effector === name)) invalid()
        const pin = object(rawPin)
        numbers(pin['position'], 3)
        numbers(pin['rotation'], 4)
      }
    }
    if (clip['contacts'] !== undefined) {
      const contacts = array(clip['contacts'])
      for (const rawContact of contacts) {
        const contact = object(rawContact)
        string(contact['id'])
        integer(contact['start'])
        integer(contact['end'])
        if (!EFFECTORS.some((effector) => effector === contact['effector'])) invalid()
        validateContactTransform(contact['anchor'])
        if (contact['prop'] !== undefined) validateContactTransform(contact['prop'])
      }
      if (!validContacts({ start, end, contacts: contacts as Contact[] })) invalid()
    }
    if (clip['limb'] !== undefined) {
      const limb = object(clip['limb'])
      if (limbRoot(parents, integer(limb['tip'])) < 0) invalid()
      if (!validateChannel(limb['targets'], 3, start, end)) invalid()
    }
  }
}
