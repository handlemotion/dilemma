// Tangent and Bézier evaluation adapted from real-timeline-editor, MIT.
// Copyright (c) 2026 Illia Komsa. See NOTICE.md and licenses/real-timeline-editor.txt.
import {
  CURVE_INTERPOLATIONS,
  type AxisCurves,
  type Clip,
  type CurveKey,
  type KeyChannel,
  type KeyProperty,
  type Quat,
  type Vec3,
} from './document.ts'

export function keyChannel(
  clip: Clip,
  joint: number,
  property: KeyProperty,
): KeyChannel | undefined {
  if (property === 'ikTarget') return clip.limb?.tip === joint ? clip.limb.targets : undefined
  return clip.tracks.find((track) => track.joint === joint)?.[property]
}

export function validAxisCurves(raw: unknown, start: number, end: number): raw is AxisCurves {
  return (
    Array.isArray(raw) &&
    raw.length === 3 &&
    raw.some((curve) => Array.isArray(curve) && curve.length > 0) &&
    Array.from(raw).every((curve: unknown) => {
      if (!Array.isArray(curve)) return false
      let previous = -Infinity
      return Array.from(curve).every((key: CurveKey) => {
        if (
          !key ||
          !Number.isInteger(key.frame) ||
          key.frame < start ||
          key.frame > end ||
          key.frame <= previous ||
          !Number.isFinite(key.value) ||
          !CURVE_INTERPOLATIONS.includes(key.interpolation)
        )
          return false
        previous = key.frame
        const tangent = key.tangent
        return (
          tangent === undefined ||
          (!!tangent &&
            (tangent.mode === 'free' || tangent.mode === 'aligned') &&
            [tangent.inDx, tangent.inDy, tangent.outDx, tangent.outDy].every(Number.isFinite) &&
            tangent.inDx <= 0 &&
            tangent.outDx >= 0)
        )
      })
    })
  )
}

export function keyFrames(channel: KeyChannel | undefined): readonly number[] {
  if (!channel) return []
  return channel.curves
    ? Array.from(
        new Set(channel.curves.flatMap((curve) => curve.map(({ frame }) => frame))),
      ).toSorted((a, b) => a - b)
    : channel.frames
}

export const CURVE_AXES = [0, 1, 2] as const
export type CurveAxis = (typeof CURVE_AXES)[number]

/** Project sampled keys for editing. Untouched rotation tracks continue to use quaternion slerp. */
export function axisCurves(channel: KeyChannel | undefined, property: KeyProperty): AxisCurves {
  if (channel?.curves) return channel.curves
  const curves: AxisCurves = [[], [], []]
  if (!channel) return curves
  let previous: Vec3 | undefined
  for (const [index, frame] of channel.frames.entries()) {
    const width = property === 'rotations' ? 4 : 3
    const offset = index * width
    const value = channel.values.slice(offset, offset + width)
    const axes = property === 'rotations' ? rotationAxes(value as Quat, previous) : (value as Vec3)
    for (const axis of CURVE_AXES) {
      curves[axis].push({ frame, value: axes[axis], interpolation: 'linear' })
    }
    previous = axes
  }
  return curves
}

const degrees = 180 / Math.PI

/** XYZ Euler angles, with the equivalent representation nearest to an existing Euler key. */
export function rotationAxes(quaternion: Quat, reference?: Vec3): Vec3 {
  const primary: Vec3 = [
    rotationAxis(...quaternion, 0),
    rotationAxis(...quaternion, 1),
    rotationAxis(...quaternion, 2),
  ]
  if (!reference) return primary
  if (Math.abs(Math.sin(primary[1] / degrees)) >= 1 - 1e-12) {
    // At gimbal lock only X + Z (or X - Z at -90 degrees) is determined.
    const sign = Math.sign(primary[1])
    primary[0] -= sign * reference[2]
    primary[2] = reference[2]
  }
  const alternate: Vec3 = [primary[0] + 180, 180 - primary[1], primary[2] + 180]
  const unwrap = (value: Vec3) =>
    value.map((angle, axis) => angle + 360 * Math.round((reference[axis]! - angle) / 360)) as Vec3
  const first = unwrap(primary)
  const second = unwrap(alternate)
  const distance = (value: Vec3) =>
    value.reduce((sum, angle, axis) => sum + (angle - reference[axis]!) ** 2, 0)
  return distance(first) <= distance(second) ? first : second
}

export function rotationAxis(x: number, y: number, z: number, w: number, axis: CurveAxis): number {
  const length = Math.hypot(x, y, z, w) || 1
  x /= length
  y /= length
  z /= length
  w /= length
  const sinY = Math.max(-1, Math.min(1, 2 * (x * z + y * w)))
  if (axis === 1) return Math.asin(sinY) * degrees
  const regular = Math.abs(sinY) < 1 - 1e-12
  if (axis === 2) {
    return regular ? Math.atan2(2 * (z * w - x * y), 1 - 2 * (y * y + z * z)) * degrees : 0
  }
  return (
    Math.atan2(
      regular ? 2 * (x * w - y * z) : 2 * (x * w + y * z),
      1 - 2 * (x * x + (regular ? y * y : z * z)),
    ) * degrees
  )
}

export interface CurveHandles {
  inDx: number
  inDy: number
  outDx: number
  outDy: number
}

/** Automatic tangents follow adjacent slopes and flatten at the ends and at extrema. */
export function curveHandles(keys: readonly CurveKey[], index: number): CurveHandles {
  const key = keys[index]!
  if (key.tangent) return key.tangent
  const prev = keys[index - 1]
  const next = keys[index + 1]
  const before = prev ? key.frame - prev.frame : 0
  const after = next ? next.frame - key.frame : 0
  let slope = 0
  if (prev && next) {
    const a = (key.value - prev.value) / before
    const b = (next.value - key.value) / after
    if (a * b > 0) {
      slope = (before * b + after * a) / (before + after)
      slope = Math.sign(slope) * Math.min(Math.abs(slope), 3 * Math.min(Math.abs(a), Math.abs(b)))
    }
  }
  return {
    inDx: -before / 3,
    inDy: (-slope * before) / 3,
    outDx: after / 3,
    outDy: (slope * after) / 3,
  }
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/** The handle time offsets are divided by the segment length before sampling. */
export function bezierValue(
  fraction: number,
  outTime: number,
  inTime: number,
  start: number,
  outValue: number,
  inValue: number,
  end: number,
): number {
  const x1 = Math.max(0, Math.min(1, outTime))
  const x2 = 1 + Math.min(0, Math.max(-1, inTime))
  let t = fraction
  if (Math.abs(x1 - 1 / 3) > 1e-12 || Math.abs(x2 - 2 / 3) > 1e-12) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (cubic(0, x1, x2, 1, mid) < fraction) lo = mid
      else hi = mid
    }
    t = (lo + hi) / 2
  }
  return cubic(start, start + outValue, end + inValue, end, t)
}

export function curveValue(keys: readonly CurveKey[], frame: number): number | undefined {
  const first = keys[0]
  if (!first || frame <= first.frame) return first?.value
  let lo = 0
  let hi = keys.length
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (keys[mid]!.frame <= frame) lo = mid
    else hi = mid
  }
  const a = keys[lo]
  const b = keys[hi]
  if (!a || !b || a.frame === frame || a.interpolation === 'constant') return a?.value
  const span = b.frame - a.frame
  const t = (frame - a.frame) / span
  if (a.interpolation === 'linear') return a.value + (b.value - a.value) * t
  const left = curveHandles(keys, lo)
  const right = curveHandles(keys, hi)
  return bezierValue(
    t,
    left.outDx / span,
    right.inDx / span,
    a.value,
    left.outDy,
    right.inDy,
    b.value,
  )
}
