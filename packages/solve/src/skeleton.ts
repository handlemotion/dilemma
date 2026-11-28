import {
  CONTROL_IDS,
  controlJoint,
  controlKind,
  EFFECTORS,
  curveHandles,
  type CurveKey,
  type Clip,
  type KeyChannel,
  type RigMapping,
  type Skeleton,
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
}

export interface Pose {
  local: Float64Array
  world: Float64Array
  authored: Float64Array
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

export const CURVE_STRIDE = 7
export type CompiledChannel =
  | { frames: Int32Array; values: Float64Array; curves?: never }
  | { curves: [Float64Array, Float64Array, Float64Array] }

export interface CompiledClip {
  start: number
  end: number
  tracks: CompiledTrack[]
  limb: { tip: number; targets: CompiledChannel } | null
  controls: (CompiledChannel | null)[]
  pins: (Float64Array | null)[]
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
  return { count, parents, rest, controls }
}

export function createPose(skeleton: CompiledSkeleton): Pose {
  return {
    local: new Float64Array(skeleton.count * LOCAL_STRIDE),
    world: new Float64Array(skeleton.count * WORLD_STRIDE),
    authored: new Float64Array(skeleton.count * LOCAL_STRIDE),
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
  const limb = clip.limb && targets ? { tip: clip.limb.tip, targets } : null
  const controls = CONTROL_IDS.map((id) =>
    compileChannel(clip.controls?.[id], controlKind(id) === 'rotation' ? 4 : 3),
  )
  const pins = EFFECTORS.map((id) => {
    const pin = clip.pins?.[id]
    return pin ? Float64Array.from([...pin.position, ...pin.rotation]) : null
  })
  return { start: clip.start, end: clip.end, tracks, limb, controls, pins }
}

function compileChannel(channel: KeyChannel | undefined, width: number): CompiledChannel | null {
  if (!channel) return null
  if (channel.curves) {
    const [x, y, z] = channel.curves
    return { curves: [compileCurve(x), compileCurve(y), compileCurve(z)] }
  }
  const { frames, values } = channel
  for (let k = 0; k < frames.length; k++) {
    const frame = frames[k]!
    if (!Number.isInteger(frame)) throw new Error(`Key frame ${frame} is not an integer.`)
    if (k > 0 && frame <= frames[k - 1]!) throw new Error('Key frames must increase.')
  }
  if (values.length !== frames.length * width) throw new Error('Wrong number of key values.')
  return frames.length
    ? { frames: Int32Array.from(frames), values: Float64Array.from(values) }
    : null
}

function compileCurve(keys: readonly CurveKey[]): Float64Array {
  const data = new Float64Array(keys.length * CURVE_STRIDE)
  keys.forEach((key, index) => {
    const { inDx, inDy, outDx, outDy } = curveHandles(keys, index)
    const mode = key.interpolation === 'constant' ? 0 : key.interpolation === 'linear' ? 1 : 2
    data.set([key.frame, key.value, mode, inDx, inDy, outDx, outDy], index * CURVE_STRIDE)
  })
  return data
}
