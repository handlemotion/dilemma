import type { Character, Clip, Joint, JointTrack, Transform } from '@dilemma/core'
import { AnimationMixer, LoopOnce, Matrix4, Quaternion, Vector3, type Object3D } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

/** Render-side resources for an imported character. Not document data. */
export interface CharacterAssets {
  root: Object3D
  /** One object per document joint, in joint order. */
  bones: Object3D[]
}

export interface ImportedCharacter {
  character: Character
  clips: Clip[]
  assets: CharacterAssets
}

export interface ImportOptions {
  /** Shown in the UI. Defaults to the file name. */
  name?: string
  /** Frame rate for baked clips. Defaults to one guessed from the key times, else 30. */
  fps?: number
  /** Load only the character when the project already contains the clips. */
  skipAnimations?: boolean
  id?: string
}

const loader = new GLTFLoader()

export async function loadGltf(
  url: string,
  options: ImportOptions = {},
): Promise<ImportedCharacter> {
  const gltf = await loader.loadAsync(url)
  return fromGltf(gltf, url, options)
}

/** Parse a .glb (ArrayBuffer) or .gltf (JSON string). `resourcePath` resolves external buffers and images. */
export async function parseGltf(
  data: ArrayBuffer | string,
  uri: string,
  resourcePath = '',
  options: ImportOptions = {},
): Promise<ImportedCharacter> {
  const gltf = await loader.parseAsync(data, resourcePath)
  return fromGltf(gltf, uri, options)
}

export function fromGltf(gltf: GLTF, uri: string, options: ImportOptions = {}): ImportedCharacter {
  const root = gltf.scene
  root.updateMatrixWorld(true)

  const jointNodes = collectJoints(root)
  if (jointNodes.length === 0) throw new Error('This file has no skinned mesh.')

  const index = new Map(jointNodes.map((node, i) => [node, i]))
  const parents = jointNodes.map((node) => nearestJointAncestor(node, index))
  const id = options.id ?? crypto.randomUUID()
  const name = options.name ?? fileName(uri)

  const joints: Joint[] = jointNodes.map((node, i) => ({
    id: `j${i}`,
    name: node.name || `joint_${i}`,
    parent: parents[i]!,
    rest: relativeTransform(node, parents[i]! >= 0 ? jointNodes[parents[i]!]! : null),
  }))

  const character: Character = { id, name, source: { uri }, skeleton: { joints } }
  const assets = { root, bones: jointNodes }
  if (options.skipAnimations || gltf.animations.length === 0)
    return { character, clips: [], assets }

  // Baking plays each animation through the scene; remember rest to restore it after.
  const saved: [Object3D, Vector3, Quaternion, Vector3][] = []
  root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]))

  const clips = gltf.animations.map((animation, ci) => {
    const fps = options.fps ?? guessFps(animation.tracks.flatMap((t) => Array.from(t.times)))
    return bakeClip(root, jointNodes, parents, joints, animation, fps, `${id}:clip${ci}`, id)
  })

  for (const [o, p, q, sc] of saved) {
    o.position.copy(p)
    o.quaternion.copy(q)
    o.scale.copy(sc)
  }
  root.updateMatrixWorld(true)

  return { character, clips, assets }
}

/** Every skin joint, in scene traversal order, so parents come before children. */
export function collectJoints(root: Object3D): Object3D[] {
  const set = new Set<Object3D>()
  root.traverse((object) => {
    const skinned = object as Object3D & {
      isSkinnedMesh?: boolean
      skeleton?: { bones: Object3D[] }
    }
    if (skinned.isSkinnedMesh && skinned.skeleton) {
      for (const bone of skinned.skeleton.bones) set.add(bone)
    }
  })
  const ordered: Object3D[] = []
  root.traverse((object) => {
    if (set.has(object)) ordered.push(object)
  })
  return ordered
}

function nearestJointAncestor(node: Object3D, index: Map<Object3D, number>): number {
  for (let p = node.parent; p; p = p.parent) {
    const i = index.get(p)
    if (i !== undefined) return i
  }
  return -1
}

const scratchMatrix = new Matrix4()
const scratchT = new Vector3()
const scratchR = new Quaternion()
const scratchS = new Vector3()

/**
 * Transform of `node` relative to `parentJoint`, baking any non-joint nodes in
 * between. For roots it is relative to the scene root, so the armature's own
 * transform lands on the root joints.
 */
function relativeTransform(node: Object3D, parentJoint: Object3D | null): Transform {
  if (parentJoint) scratchMatrix.copy(parentJoint.matrixWorld).invert().multiply(node.matrixWorld)
  else scratchMatrix.copy(node.matrixWorld)
  scratchMatrix.decompose(scratchT, scratchR, scratchS)
  return {
    translation: [scratchT.x, scratchT.y, scratchT.z],
    rotation: [scratchR.x, scratchR.y, scratchR.z, scratchR.w],
    scale: [scratchS.x, scratchS.y, scratchS.z],
  }
}

function bakeClip(
  root: Object3D,
  nodes: Object3D[],
  parents: number[],
  joints: Joint[],
  animation: GLTF['animations'][number],
  fps: number,
  id: string,
  characterId: string,
): Clip {
  const mixer = new AnimationMixer(root)
  const action = mixer.clipAction(animation)
  action.setLoop(LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  const end = Math.max(0, Math.round(animation.duration * fps))
  const frames: number[] = []
  const t: number[][] = nodes.map(() => [])
  const r: number[][] = nodes.map(() => [])
  const s: number[][] = nodes.map(() => [])
  const prev = nodes.map(() => new Quaternion())

  for (let f = 0; f <= end; f++) {
    mixer.setTime(f / fps)
    root.updateMatrixWorld(true)
    frames.push(f)
    nodes.forEach((node, i) => {
      const parent = parents[i]!
      const { translation, rotation, scale } = relativeTransform(
        node,
        parent >= 0 ? nodes[parent]! : null,
      )
      // Keep quaternions on one hemisphere so neighbors interpolate the short way.
      const q = new Quaternion(...rotation)
      if (f > 0 && q.dot(prev[i]!) < 0) q.set(-q.x, -q.y, -q.z, -q.w)
      prev[i]!.copy(q)
      t[i]!.push(...translation)
      r[i]!.push(q.x, q.y, q.z, q.w)
      s[i]!.push(...scale)
    })
  }
  mixer.stopAllAction()
  mixer.uncacheRoot(root)

  const tracks: JointTrack[] = []
  joints.forEach((joint, i) => {
    const track: JointTrack = { joint: i }
    if (varies(t[i]!, joint.rest.translation)) track.translations = { frames, values: t[i]! }
    if (varies(r[i]!, joint.rest.rotation, true)) track.rotations = { frames, values: r[i]! }
    if (varies(s[i]!, joint.rest.scale)) track.scales = { frames, values: s[i]! }
    if (track.translations || track.rotations || track.scales) tracks.push(track)
  })

  return { id, name: animation.name || 'Clip', characterId, fps, start: 0, end, tracks }
}

const EPSILON = 1e-6

function varies(values: number[], rest: number[], quaternion = false): boolean {
  const width = rest.length
  for (let k = 0; k < values.length; k += width) {
    let same = true
    let flipped = quaternion
    for (let c = 0; c < width; c++) {
      if (Math.abs(values[k + c]! - rest[c]!) > EPSILON) same = false
      if (Math.abs(values[k + c]! + rest[c]!) > EPSILON) flipped = false
    }
    if (!same && !flipped) return true
  }
  return false
}

// In order of preference: when key times fit several rates, the common default wins.
const FPS_CANDIDATES = [30, 24, 25, 60, 48, 50, 120]

/** The first frame rate in FPS_CANDIDATES that puts every key time on an integer frame. */
export function guessFps(times: number[]): number {
  if (times.length === 0) return 30
  for (const fps of FPS_CANDIDATES) {
    if (times.every((time) => Math.abs(time * fps - Math.round(time * fps)) < 1e-3)) return fps
  }
  return 30
}

function fileName(uri: string): string {
  const last = decodeURIComponent(uri.split(/[\\/]/).pop() ?? uri)
  return last.replace(/\.(glb|gltf)$/i, '') || 'Character'
}
