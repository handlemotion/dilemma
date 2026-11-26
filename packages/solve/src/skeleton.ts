import type { Clip, Skeleton } from '@dilemma/core'

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
}

export interface CompiledTrack {
  joint: number
  frames: Int32Array
  translations: Float64Array | null
  rotations: Float64Array | null
  scales: Float64Array | null
}

export interface CompiledClip {
  start: number
  end: number
  tracks: CompiledTrack[]
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
  }
}

export function compileClip(clip: Clip, jointCount: number): CompiledClip {
  const tracks = clip.tracks.map((track): CompiledTrack => {
    if (track.joint < 0 || track.joint >= jointCount) {
      throw new Error(`Clip ${clip.name} has a track for missing joint ${track.joint}.`)
    }
    for (let k = 0; k < track.frames.length; k++) {
      const f = track.frames[k]!
      if (!Number.isInteger(f)) throw new Error(`Key frame ${f} is not an integer.`)
      if (k > 0 && f <= track.frames[k - 1]!) throw new Error('Key frames must increase.')
    }
    const channel = (values: number[] | undefined, width: number) => {
      if (!values) return null
      if (values.length !== track.frames.length * width) {
        throw new Error(`Track for joint ${track.joint} has the wrong number of values.`)
      }
      return Float64Array.from(values)
    }
    return {
      joint: track.joint,
      frames: Int32Array.from(track.frames),
      translations: channel(track.translations, 3),
      rotations: channel(track.rotations, 4),
      scales: channel(track.scales, 3),
    }
  })
  return { start: clip.start, end: clip.end, tracks }
}
