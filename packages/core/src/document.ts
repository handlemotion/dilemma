/**
 * The Dilemma document: plain serializable data. No classes, no typed arrays,
 * no functions. Conventions follow glTF: meters, Y up, right-handed,
 * rotations as unit quaternions [x, y, z, w]. Key times are integer frames.
 */

import type { Contact } from './contact.ts'
import type { ControlId, Effector, RigMapping } from './rig.ts'

export const DOCUMENT_VERSION = 6

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

export interface Transform {
  translation: Vec3
  rotation: Quat
  scale: Vec3
}

export interface Joint {
  id: string
  name: string
  /** Index of the parent joint in `Skeleton.joints`, or -1 for a root. Parents always precede children. */
  parent: number
  rest: Transform
}

export interface Skeleton {
  joints: Joint[]
}

export interface Character {
  id: string
  name: string
  /** Where the mesh, skin weights and shapes come from. The document stores the reference, not the data. */
  source: { uri: string }
  skeleton: Skeleton
  rig?: RigMapping
}

/** Integer frames in ascending order, with one flattened value per frame. */
export interface KeyChannel {
  frames: number[]
  values: number[]
}

export const TRANSFORM_CHANNELS = ['translations', 'rotations', 'scales'] as const
export type TransformChannel = (typeof TRANSFORM_CHANNELS)[number]
export type TransformKey =
  | { channel: 'translations'; value: Vec3 }
  | { channel: 'rotations'; value: Quat }
  | { channel: 'scales'; value: Vec3 }

export type ControlKey = { channel: 'control'; control: ControlId; value: Vec3 | Quat }
export type PoseKey = TransformKey | ControlKey | { channel: 'ikTarget'; value: Vec3 }

export interface EffectorPin {
  position: Vec3
  rotation: Quat
}

/** One two-bone limb per clip. The target is a world-space position in meters. */
export interface LimbTrack {
  tip: number
  targets: KeyChannel
}

export function limbRoot(parents: ArrayLike<number>, tip: number): number {
  const middle = parents[tip] ?? -1
  return middle < 0 ? -1 : (parents[middle] ?? -1)
}

/** Each channel has its own key times so edits to one preserve the others. */
export interface JointTrack {
  joint: number
  translations?: KeyChannel
  rotations?: KeyChannel
  scales?: KeyChannel
}

export interface Clip {
  id: string
  name: string
  characterId: string
  /** Frames per second the integer key frames are counted against. */
  fps: number
  start: number
  end: number
  tracks: JointTrack[]
  limb?: LimbTrack
  controls?: Partial<Record<ControlId, KeyChannel>>
  pins?: Partial<Record<Effector, EffectorPin>>
  contacts?: Contact[]
}

export type SceneTiming = Pick<Clip, 'fps' | 'start' | 'end'>

export const DEFAULT_SCENE_TIMING: Readonly<SceneTiming> = { fps: 30, start: 0, end: 120 }

export function validSceneTiming({ fps, start, end }: SceneTiming): boolean {
  return (
    Number.isFinite(fps) && fps > 0 && (start | 0) === start && (end | 0) === end && start <= end
  )
}

export interface DilemmaDocument {
  version: typeof DOCUMENT_VERSION
  sceneTiming: SceneTiming
  characters: Character[]
  clips: Clip[]
}

export function emptyDocument(): DilemmaDocument {
  return {
    version: DOCUMENT_VERSION,
    sceneTiming: { ...DEFAULT_SCENE_TIMING },
    characters: [],
    clips: [],
  }
}

export function findCharacter(doc: DilemmaDocument, id: string): Character | undefined {
  return doc.characters.find((c) => c.id === id)
}

export function clipsFor(doc: DilemmaDocument, characterId: string): Clip[] {
  return doc.clips.filter((c) => c.characterId === characterId)
}
