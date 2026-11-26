/**
 * The Dilemma document: plain serializable data. No classes, no typed arrays,
 * no functions. Conventions follow glTF: meters, Y up, right-handed,
 * rotations as unit quaternions [x, y, z, w]. Key times are integer frames.
 */

export const DOCUMENT_VERSION = 1

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
}

/**
 * Keys for one joint. `frames` are strictly increasing integers. Each channel,
 * when present, holds one value per frame, flattened (3 or 4 numbers per key).
 */
export interface JointTrack {
  joint: number
  frames: number[]
  translations?: number[]
  rotations?: number[]
  scales?: number[]
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
}

export interface DilemmaDocument {
  version: typeof DOCUMENT_VERSION
  characters: Character[]
  clips: Clip[]
}

export function emptyDocument(): DilemmaDocument {
  return { version: DOCUMENT_VERSION, characters: [], clips: [] }
}

export function findCharacter(doc: DilemmaDocument, id: string): Character | undefined {
  return doc.characters.find((c) => c.id === id)
}

export function clipsFor(doc: DilemmaDocument, characterId: string): Clip[] {
  return doc.clips.filter((c) => c.characterId === characterId)
}
