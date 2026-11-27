import type { PoseKey } from '@dilemma/core'
import { applyLimb } from './limb.ts'
import {
  LOCAL_STRIDE,
  WORLD_STRIDE,
  type CompiledClip,
  type CompiledSkeleton,
  type CompiledChannel,
  type Pose,
} from './skeleton.ts'

export interface PosePreview {
  local: Float64Array
  ik: Pick<Pose['ik'], 'tip' | 'target'> | null
}

export function compilePosePreview(
  jointCount: number,
  edits: readonly { joint: number; key: PoseKey }[],
): PosePreview {
  const local = new Float64Array(jointCount * LOCAL_STRIDE).fill(NaN)
  let ik: PosePreview['ik'] = null
  for (const { joint, key } of edits) {
    if (key.channel === 'ikTarget') ik = { tip: joint, target: Float64Array.from(key.value) }
    else local.set(key.value, joint * LOCAL_STRIDE + localOffsets[key.channel])
  }
  return { local, ik }
}

const localOffsets = { translations: 0, rotations: 3, scales: 7 } as const

/**
 * Full pose solve: sample the clip at `frame` into local transforms, then
 * compose world matrices. Deterministic: same inputs, same output. Allocates
 * nothing. `frame` is a clip frame; fractional values interpolate between keys.
 */
export function solvePose(
  skeleton: CompiledSkeleton,
  clip: CompiledClip | null,
  frame: number,
  pose: Pose,
  preview?: PosePreview,
): void {
  pose.local.set(skeleton.rest)
  if (clip) sampleClip(clip, frame, pose.local)
  if (preview) {
    const { local } = preview
    for (let i = 0; i < local.length; i++) {
      const value = local[i]!
      if (!Number.isNaN(value)) pose.local[i] = value
    }
  }
  computeWorld(skeleton, pose)
  pose.ik.tip = -1
  if (preview?.ik) {
    pose.ik.tip = preview.ik.tip
    pose.ik.target.set(preview.ik.target)
  } else if (clip?.limb) {
    pose.ik.tip = clip.limb.tip
    sampleChannel(clip.limb.targets, frame, pose.ik.target, 0, lerp3)
  }
  pose.ik.applied = pose.ik.tip >= 0 && applyLimb(skeleton, pose)
  if (pose.ik.applied) computeWorld(skeleton, pose)
}

export function sampleClip(clip: CompiledClip, frame: number, local: Float64Array): void {
  for (const track of clip.tracks) {
    const o = track.joint * LOCAL_STRIDE
    if (track.translations) sampleChannel(track.translations, frame, local, o, lerp3)
    if (track.rotations) sampleChannel(track.rotations, frame, local, o + 3, slerp)
    if (track.scales) sampleChannel(track.scales, frame, local, o + 7, lerp3)
  }
}

function sampleChannel(
  { frames, values }: CompiledChannel,
  frame: number,
  local: Float64Array,
  offset: number,
  interpolate: typeof lerp3,
): void {
  const n = frames.length
  if (n === 0) return
  // Find the key span [a, b] holding the frame, clamped at both ends.
  let a = 0
  let b = 0
  let t = 0
  if (frame <= frames[0]!) {
    a = b = 0
  } else if (frame >= frames[n - 1]!) {
    a = b = n - 1
  } else {
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (frames[mid]! <= frame) lo = mid
      else hi = mid
    }
    a = lo
    b = hi
    t = (frame - frames[a]!) / (frames[b]! - frames[a]!)
  }
  interpolate(values, a, b, t, local, offset)
}

function lerp3(v: Float64Array, a: number, b: number, t: number, out: Float64Array, o: number) {
  const ia = a * 3
  const ib = b * 3
  for (let i = 0; i < 3; i++) out[o + i] = v[ia + i]! + (v[ib + i]! - v[ia + i]!) * t
}

/** Shortest-arc quaternion slerp, normalized. */
export function slerp(
  q: Float64Array,
  a: number,
  b: number,
  t: number,
  out: Float64Array,
  o: number,
): void {
  const ia = a * 4
  const ib = b * 4
  const ax = q[ia]!
  const ay = q[ia + 1]!
  const az = q[ia + 2]!
  const aw = q[ia + 3]!
  let bx = q[ib]!
  let by = q[ib + 1]!
  let bz = q[ib + 2]!
  let bw = q[ib + 3]!
  let cos = ax * bx + ay * by + az * bz + aw * bw
  if (cos < 0) {
    cos = -cos
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  let wa: number
  let wb: number
  if (cos > 0.9995) {
    wa = 1 - t
    wb = t
  } else {
    const theta = Math.acos(cos)
    const sin = Math.sin(theta)
    wa = Math.sin((1 - t) * theta) / sin
    wb = Math.sin(t * theta) / sin
  }
  const x = ax * wa + bx * wb
  const y = ay * wa + by * wb
  const z = az * wa + bz * wb
  const w = aw * wa + bw * wb
  const len = Math.hypot(x, y, z, w) || 1
  out[o] = x / len
  out[o + 1] = y / len
  out[o + 2] = z / len
  out[o + 3] = w / len
}

/** World matrix per joint = parent world × local TRS. Column-major. */
export function computeWorld(skeleton: CompiledSkeleton, pose: Pose): void {
  const { local, world } = pose
  const parents = skeleton.parents
  for (let i = 0; i < skeleton.count; i++) {
    const l = i * LOCAL_STRIDE
    const w = i * WORLD_STRIDE
    composeTRS(local, l, world, w)
    const p = parents[i]!
    if (p >= 0) multiplyInPlaceLeft(world, p * WORLD_STRIDE, w)
  }
}

function composeTRS(src: Float64Array, s: number, out: Float64Array, o: number): void {
  const tx = src[s]!
  const ty = src[s + 1]!
  const tz = src[s + 2]!
  const x = src[s + 3]!
  const y = src[s + 4]!
  const z = src[s + 5]!
  const w = src[s + 6]!
  const sx = src[s + 7]!
  const sy = src[s + 8]!
  const sz = src[s + 9]!
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  out[o] = (1 - (yy + zz)) * sx
  out[o + 1] = (xy + wz) * sx
  out[o + 2] = (xz - wy) * sx
  out[o + 3] = 0
  out[o + 4] = (xy - wz) * sy
  out[o + 5] = (1 - (xx + zz)) * sy
  out[o + 6] = (yz + wx) * sy
  out[o + 7] = 0
  out[o + 8] = (xz + wy) * sz
  out[o + 9] = (yz - wx) * sz
  out[o + 10] = (1 - (xx + yy)) * sz
  out[o + 11] = 0
  out[o + 12] = tx
  out[o + 13] = ty
  out[o + 14] = tz
  out[o + 15] = 1
}

/** m[b] = m[a] × m[b], both column-major 4x4 inside the same buffer. */
function multiplyInPlaceLeft(m: Float64Array, a: number, b: number): void {
  for (let col = 0; col < 4; col++) {
    const c = b + col * 4
    const b0 = m[c]!
    const b1 = m[c + 1]!
    const b2 = m[c + 2]!
    const b3 = m[c + 3]!
    for (let row = 0; row < 4; row++) {
      m[c + row] =
        m[a + row]! * b0 + m[a + 4 + row]! * b1 + m[a + 8 + row]! * b2 + m[a + 12 + row]! * b3
    }
  }
}

/** World-space position of a joint, read from its matrix. */
export function jointPosition(pose: Pose, joint: number, out: [number, number, number]): void {
  const o = joint * WORLD_STRIDE
  out[0] = pose.world[o + 12]!
  out[1] = pose.world[o + 13]!
  out[2] = pose.world[o + 14]!
}
