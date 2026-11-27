import { limbRoot } from '@dilemma/core'
import { LOCAL_STRIDE, WORLD_STRIDE, type CompiledSkeleton, type Pose } from './skeleton.ts'

export function canSolveLimb(skeleton: CompiledSkeleton, pose: Pose, tip: number): boolean {
  const root = limbRoot(skeleton.parents, tip)
  if (root < 0) return false
  const { local } = pose
  const r = root * LOCAL_STRIDE
  const m = skeleton.parents[tip]! * LOCAL_STRIDE
  const t = tip * LOCAL_STRIDE
  const scale = local[r + 7]!
  return (
    scale > 0 &&
    Math.abs(local[r + 8]! / scale - 1) < 1e-6 &&
    Math.abs(local[r + 9]! / scale - 1) < 1e-6 &&
    Math.hypot(local[m]!, local[m + 1]!, local[m + 2]!) > 0 &&
    Math.hypot(
      local[t]! * local[m + 7]!,
      local[t + 1]! * local[m + 8]!,
      local[t + 2]! * local[m + 9]!,
    ) > 0
  )
}

/** Align the two segments to a triangle formed by their lengths and target distance. */
export function applyLimb(skeleton: CompiledSkeleton, pose: Pose): boolean {
  const { ik, local, world } = pose
  const { tip, scratch } = ik
  if (!canSolveLimb(skeleton, pose, tip)) return false
  const root = limbRoot(skeleton.parents, tip)
  const parent = skeleton.parents[root]!
  const r = root * LOCAL_STRIDE
  const m = skeleton.parents[tip]! * LOCAL_STRIDE
  const t = tip * LOCAL_STRIDE
  const { upper, lower, aim, target, normal, bend, elbow, transport, swing, rootDelta } = scratch

  // Solve in the FK root's rotation basis. The root parent's full affine
  // transform can be undone even when ancestors have nonuniform scale.
  target.set(ik.target)
  if (parent >= 0 && !toParentSpace(target, world, parent * WORLD_STRIDE)) return false
  for (let i = 0; i < 3; i++) {
    target[i] = target[i]! - local[r + i]!
    upper[i] = local[m + i]! * local[r + 7]!
    lower[i] = local[t + i]! * local[m + 7 + i]! * local[r + 7]!
  }
  rotate(target, local, r + 3, -1)
  rotate(lower, local, m + 3)
  const a = Math.hypot(upper[0]!, upper[1]!, upper[2]!)
  const b = Math.hypot(lower[0]!, lower[1]!, lower[2]!)
  const reach = a + b
  const epsilon = reach * 1e-12
  const targetDistance = Math.hypot(target[0]!, target[1]!, target[2]!)
  if (!Number.isFinite(targetDistance + reach) || !a || !b) return false
  for (let i = 0; i < 3; i++) aim[i] = upper[i]! + lower[i]!
  if (Math.hypot(target[0]! - aim[0]!, target[1]! - aim[1]!, target[2]! - aim[2]!) <= epsilon)
    return false

  // Carry the FK bend plane along with the aim, with a stable fallback for
  // straight limbs. The two remaining swings stay in that plane.
  if (!normalize(aim, epsilon)) {
    aim.set(upper)
    normalize(aim)
  }
  cross(normal, aim, upper)
  if (!normalize(normal, epsilon)) {
    bend[0] = 0
    bend[1] = Math.abs(aim[2]!) > 0.9 ? 1 : 0
    bend[2] = 1 - bend[1]!
    cross(normal, aim, bend)
    normalize(normal)
  }
  if (!normalize(target, epsilon)) target.set(aim)
  fromTo(transport, aim, target, normal)
  bend.set(normal)
  rotate(bend, transport)
  cross(elbow, bend, target)

  const distance = Math.max(Math.abs(a - b), Math.min(reach, targetDistance))
  const along = distance === 0 ? 0 : (distance + ((a - b) / distance) * reach) * 0.5
  const cosine = Math.max(-1, Math.min(1, along / a))
  const height = a * Math.sqrt(1 - cosine * cosine)
  for (let i = 0; i < 3; i++) {
    elbow[i] = target[i]! * (cosine * a) + elbow[i]! * height
    target[i] = target[i]! * distance - elbow[i]!
  }
  rotate(upper, transport)
  fromTo(swing, upper, elbow, bend)
  multiply(rootDelta, 0, swing, 0, transport, 0)
  rotate(target, rootDelta, 0, -1)
  fromTo(swing, lower, target, normal)
  for (let i = 0; i < 4; i++) {
    ik.fkRotations[i] = local[r + 3 + i]!
    ik.fkRotations[i + 4] = local[m + 3 + i]!
  }
  multiply(local, r + 3, local, r + 3, rootDelta, 0)
  multiply(local, m + 3, swing, 0, local, m + 3)
  return true
}

function toParentSpace(point: Float64Array, world: Float64Array, o: number): boolean {
  const ax = world[o]!,
    ay = world[o + 1]!,
    az = world[o + 2]!
  const bx = world[o + 4]!,
    by = world[o + 5]!,
    bz = world[o + 6]!
  const cx = world[o + 8]!,
    cy = world[o + 9]!,
    cz = world[o + 10]!
  const x = point[0]! - world[o + 12]!
  const y = point[1]! - world[o + 13]!
  const z = point[2]! - world[o + 14]!
  const nx = by * cz - bz * cy
  const ny = bz * cx - bx * cz
  const nz = bx * cy - by * cx
  const determinant = ax * nx + ay * ny + az * nz
  if (!determinant || !Number.isFinite(determinant)) return false
  point[0] = (x * nx + y * ny + z * nz) / determinant
  point[1] =
    (x * (cy * az - cz * ay) + y * (cz * ax - cx * az) + z * (cx * ay - cy * ax)) / determinant
  point[2] =
    (x * (ay * bz - az * by) + y * (az * bx - ax * bz) + z * (ax * by - ay * bx)) / determinant
  return true
}

function normalize(v: Float64Array, epsilon = 0): boolean {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!)
  if (length <= epsilon) return false
  v[0] = v[0]! / length
  v[1] = v[1]! / length
  v[2] = v[2]! / length
  return true
}

function cross(out: Float64Array, a: Float64Array, b: Float64Array): void {
  out[0] = a[1]! * b[2]! - a[2]! * b[1]!
  out[1] = a[2]! * b[0]! - a[0]! * b[2]!
  out[2] = a[0]! * b[1]! - a[1]! * b[0]!
}

/** Unit quaternion that swings a onto b, with a supplied axis for a half-turn. */
function fromTo(out: Float64Array, a: Float64Array, b: Float64Array, normal: Float64Array): void {
  const ax = a[0]!,
    ay = a[1]!,
    az = a[2]!
  const bx = b[0]!,
    by = b[1]!,
    bz = b[2]!
  cross(out, a, b)
  const dot = ax * bx + ay * by + az * bz
  const sin = Math.hypot(out[0]!, out[1]!, out[2]!)
  const half = Math.atan2(sin, dot) * 0.5
  if (sin <= Math.abs(dot) * 1e-12) {
    out.set(normal)
  } else {
    normalize(out)
  }
  const scale = Math.sin(half)
  for (let i = 0; i < 3; i++) out[i] = out[i]! * scale
  out[3] = Math.cos(half)
}

function rotate(v: Float64Array, q: Float64Array, o = 0, sign = 1): void {
  const x = q[o]! * sign,
    y = q[o + 1]! * sign,
    z = q[o + 2]! * sign,
    w = q[o + 3]!
  const vx = v[0]!,
    vy = v[1]!,
    vz = v[2]!
  const tx = 2 * (y * vz - z * vy)
  const ty = 2 * (z * vx - x * vz)
  const tz = 2 * (x * vy - y * vx)
  v[0] = vx + w * tx + y * tz - z * ty
  v[1] = vy + w * ty + z * tx - x * tz
  v[2] = vz + w * tz + x * ty - y * tx
}

function multiply(
  out: Float64Array,
  o: number,
  a: Float64Array,
  i: number,
  b: Float64Array,
  j: number,
): void {
  const ax = a[i]!,
    ay = a[i + 1]!,
    az = a[i + 2]!,
    aw = a[i + 3]!
  const bx = b[j]!,
    by = b[j + 1]!,
    bz = b[j + 2]!,
    bw = b[j + 3]!
  out[o] = aw * bx + ax * bw + ay * bz - az * by
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz
}
