import { multiplyQuaternion, rotate } from './limb.ts'
import {
  CONTROL_IDS,
  controlJoint,
  controlKind,
  EFFECTORS,
  type Clip,
  type KeyChannel,
  type RigMapping,
  type Skeleton,
  limbRoot,
} from '@dilemma/core'

/** Floats per joint in a local pose: translation (3), rotation quaternion xyzw (4), scale (3). */
export const LOCAL_STRIDE = 10
/** Floats per joint in a world pose: a column-major 4x4 matrix, as in glTF. */
export const WORLD_STRIDE = 16

export interface CompiledSkeleton {
  count: number
  /** Parent index per joint, -1 for roots. Parents precede children. */
  parents: Int32Array
  /** Rest pose, LOCAL_STRIDE floats per joint. */
  rest: Float64Array
  controls: Int32Array
  bodyJoints: Int32Array
}

export interface Pose {
  local: Float64Array
  world: Float64Array
  authored: Float64Array
  controlLocal: Float64Array
  targets: Float64Array[]
  targetWeights: Float64Array
  pinTransforms: Float64Array[]
  pinWeights: Float64Array
  body: {
    parameters: Float64Array
    errors: Float64Array
    probe: Float64Array
    point: Float64Array
    rotation: Float64Array
  }
  /** World-space marker positions indexed by CONTROL_IDS. */
  controlPositions: Float64Array
  pinned: Uint8Array
  ik: {
    tip: number
    target: Float64Array
    applied: boolean
    fkRotations: Float64Array
    scratch: ReturnType<typeof createLimbScratch>
  }
}

export interface CompiledTrack {
  joint: number
  translations: CompiledChannel | null
  rotations: CompiledChannel | null
  scales: CompiledChannel | null
}

export interface CompiledChannel {
  frames: Int32Array
  values: Float64Array
}

export interface CompiledClip {
  start: number
  end: number
  tracks: CompiledTrack[]
  limb: { tip: number; targets: CompiledChannel } | null
  controls: (CompiledChannel | null)[]
  pins: (Float64Array | null)[]
  contacts: Float64Array[]
}

export function compileSkeleton(skeleton: Skeleton, rig?: RigMapping): CompiledSkeleton {
  const count = skeleton.joints.length
  const parents = new Int32Array(count)
  const rest = new Float64Array(count * LOCAL_STRIDE)
  skeleton.joints.forEach((joint, i) => {
    if (joint.parent >= i) {
      throw new Error(`Joint ${joint.name} (${i}) must come after its parent (${joint.parent}).`)
    }
    parents[i] = joint.parent
    const o = i * LOCAL_STRIDE
    rest.set(joint.rest.translation, o)
    rest.set(joint.rest.rotation, o + 3)
    rest.set(joint.rest.scale, o + 7)
  })
  const controls = Int32Array.from(CONTROL_IDS, (id) => controlJoint(skeleton, rig, id) ?? -1)
  const hips = controls[0]!
  const pivots = new Set<number>()
  if (hips >= 0) {
    for (const hand of [3, 4]) {
      const root = limbRoot(parents, controls[hand]!)
      if (root < 0) continue
      const shoulder = parents[root]!
      let spine = shoulder
      while (spine >= 0 && spine !== hips && parents[spine] !== hips) spine = parents[spine]!
      if (spine < 0 || spine === hips) continue
      pivots.add(shoulder)
      pivots.add(spine)
    }
  }
  return { count, parents, rest, controls, bodyJoints: Int32Array.from(pivots) }
}

export function createPose(skeleton: CompiledSkeleton): Pose {
  return {
    local: new Float64Array(skeleton.count * LOCAL_STRIDE),
    world: new Float64Array(skeleton.count * WORLD_STRIDE),
    authored: new Float64Array(skeleton.count * LOCAL_STRIDE),
    controlLocal: new Float64Array(skeleton.count * LOCAL_STRIDE),
    targets: EFFECTORS.map(() => new Float64Array(3)),
    targetWeights: new Float64Array(EFFECTORS.length),
    pinTransforms: EFFECTORS.map(() => new Float64Array(7)),
    pinWeights: new Float64Array(EFFECTORS.length),
    body: {
      parameters: new Float64Array((skeleton.bodyJoints.length + 1) * 3),
      errors: new Float64Array(EFFECTORS.length),
      probe: new Float64Array(EFFECTORS.length),
      point: new Float64Array(3),
      rotation: new Float64Array(4),
    },
    controlPositions: new Float64Array(CONTROL_IDS.length * 3),
    pinned: new Uint8Array(CONTROL_IDS.length),
    ik: {
      tip: -1,
      target: new Float64Array(3),
      applied: false,
      fkRotations: new Float64Array(8),
      scratch: createLimbScratch(),
    },
  }
}

function createLimbScratch() {
  return {
    upper: new Float64Array(3),
    lower: new Float64Array(3),
    aim: new Float64Array(3),
    target: new Float64Array(3),
    normal: new Float64Array(3),
    bend: new Float64Array(3),
    elbow: new Float64Array(3),
    transport: new Float64Array(4),
    swing: new Float64Array(4),
    rootDelta: new Float64Array(4),
    pole: new Float64Array(3),
    effectorTarget: new Float64Array(3),
    effectorPole: new Float64Array(3),
    ancestor: new Float64Array(4),
  }
}

export const CONTACT_STRIDE = 9

export function compileClip(clip: Clip, jointCount: number): CompiledClip {
  const tracks = clip.tracks.map((track): CompiledTrack => {
    if (track.joint < 0 || track.joint >= jointCount) {
      throw new Error(`Clip ${clip.name} has a track for missing joint ${track.joint}.`)
    }
    return {
      joint: track.joint,
      translations: compileChannel(track.translations, 3),
      rotations: compileChannel(track.rotations, 4),
      scales: compileChannel(track.scales, 3),
    }
  })
  const targets = compileChannel(clip.limb?.targets, 3)
  const limb = clip.limb && targets?.frames.length ? { tip: clip.limb.tip, targets } : null
  const controls = CONTROL_IDS.map((id) =>
    compileChannel(clip.controls?.[id], controlKind(id) === 'rotation' ? 4 : 3),
  )
  const pins = EFFECTORS.map((id) => {
    const pin = clip.pins?.[id]
    return pin ? Float64Array.from([...pin.position, ...pin.rotation]) : null
  })
  const contacts = EFFECTORS.map((effector) => {
    const entries = (clip.contacts ?? []).filter((entry) => entry.effector === effector)
    entries.sort((a, b) => a.start - b.start)
    const data = new Float64Array(entries.length * CONTACT_STRIDE)
    let offset = 0
    for (const { start, end, anchor, prop } of entries) {
      data[offset] = start
      data[offset + 1] = end
      const point = Float64Array.from(anchor.position)
      if (prop) {
        rotate(point, Float64Array.from(prop.rotation))
        for (let axis = 0; axis < 3; axis++) point[axis] = point[axis]! + prop.position[axis]!
        multiplyQuaternion(
          data,
          offset + 5,
          Float64Array.from(prop.rotation),
          0,
          Float64Array.from(anchor.rotation),
          0,
        )
      } else data.set(anchor.rotation, offset + 5)
      data.set(point, offset + 2)
      offset += CONTACT_STRIDE
    }
    return data
  })
  return { start: clip.start, end: clip.end, tracks, limb, controls, pins, contacts }
}

function compileChannel(channel: KeyChannel | undefined, width: number): CompiledChannel | null {
  if (!channel) return null
  const { frames, values } = channel
  for (let k = 0; k < frames.length; k++) {
    const frame = frames[k]!
    if (!Number.isInteger(frame)) throw new Error(`Key frame ${frame} is not an integer.`)
    if (k > 0 && frame <= frames[k - 1]!) throw new Error('Key frames must increase.')
  }
  if (values.length !== frames.length * width) throw new Error('Wrong number of key values.')
  return { frames: Int32Array.from(frames), values: Float64Array.from(values) }
}
