import type { Clip, KeyChannel, Skeleton } from '@dilemma/core'

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
}

export interface Pose {
  local: Float64Array
  world: Float64Array
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
}

export function compileSkeleton(skeleton: Skeleton): CompiledSkeleton {
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
  return { count, parents, rest }
}

export function createPose(skeleton: CompiledSkeleton): Pose {
  return {
    local: new Float64Array(skeleton.count * LOCAL_STRIDE),
    world: new Float64Array(skeleton.count * WORLD_STRIDE),
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
  const limb = clip.limb && targets?.frames.length ? { tip: clip.limb.tip, targets } : null
  return { start: clip.start, end: clip.end, tracks, limb }
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
