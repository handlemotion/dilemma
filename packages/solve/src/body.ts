import { limbRoot } from '@dilemma/core'
import { multiplyQuaternion, toParentSpace } from './limb.ts'
import { LOCAL_STRIDE, WORLD_STRIDE, type CompiledSkeleton, type Pose } from './skeleton.ts'

/**
 * Bring the limb roots into reach before the analytic limb pass. A bounded,
 * damped coordinate solve distributes correction across the shoulders, spine
 * and pelvis. In-range targets leave the authored body pose alone.
 */
export function solveBody(
  skeleton: CompiledSkeleton,
  pose: Pose,
  updateWorld: (skeleton: CompiledSkeleton, pose: Pose) => void,
): void {
  const hips = skeleton.controls[0]!
  if (hips < 0 || !pose.targetWeights.some((weight) => weight > 0)) return
  const { errors, probe, parameters } = pose.body
  let cost = reachCost(skeleton, pose, errors)
  if (cost < 1e-14) return

  parameters.fill(0)
  // The world-space limb lengths set a translation limit for the pelvis.
  let reach = 0
  for (let limb = 0; limb < errors.length; limb++) {
    if (!pose.targetWeights[limb]) continue
    const tip = skeleton.controls[limb + 3]!
    const root = limbRoot(skeleton.parents, tip) * WORLD_STRIDE
    const middle = skeleton.parents[tip]! * WORLD_STRIDE
    const end = tip * WORLD_STRIDE
    reach = Math.max(
      reach,
      segmentLength(pose.world, root, middle) + segmentLength(pose.world, middle, end),
    )
  }
  const hipParent = skeleton.parents[hips]! * WORLD_STRIDE

  for (let pass = 0; pass < 7; pass++) {
    const previousCost = cost
    for (let index = 0; index < parameters.length; index++) {
      const joint = skeleton.bodyJoints[Math.floor(index / 3)] ?? hips
      const axis = index % 3
      const basis = hipParent + axis * 4
      const scale =
        hipParent < 0
          ? 1
          : Math.hypot(pose.world[basis]!, pose.world[basis + 1]!, pose.world[basis + 2]!)
      const limit = joint === hips ? (scale > 1e-12 ? (0.55 * reach) / scale : 0) : 0.28
      if (!limit) continue
      const old = parameters[index]!
      const step = (old >= 0 ? -1 : 1) * limit * 0.002
      parameters[index] = old + step
      applyBodyParameter(pose, joint, hips, index)
      updateWorld(skeleton, pose)
      reachCost(skeleton, pose, probe)

      let slope = 0
      let curvature = 0
      for (let limb = 0; limb < errors.length; limb++) {
        const derivative = (probe[limb]! - errors[limb]!) / step
        const weight = pose.targetWeights[limb]!
        slope += weight * derivative * errors[limb]!
        curvature += weight * derivative * derivative
      }
      const delta = -slope / (curvature + 1e-5)
      const desired = Math.max(-limit, Math.min(limit, old + delta))
      let accepted = false
      for (let retry = 0; retry < 5; retry++) {
        if (desired === old) break
        parameters[index] = old + (desired - old) * 0.5 ** retry
        applyBodyParameter(pose, joint, hips, index)
        updateWorld(skeleton, pose)
        const nextCost = reachCost(skeleton, pose, probe)
        if (nextCost >= cost) continue
        cost = nextCost
        errors.set(probe)
        accepted = true
        break
      }
      if (!accepted) {
        parameters[index] = old
        applyBodyParameter(pose, joint, hips, index)
        updateWorld(skeleton, pose)
      }
      if (cost < 1e-14) return
    }
    if (previousCost - cost < Math.max(1e-14, cost * 1e-5)) return
  }
}

function segmentLength(world: Float64Array, from: number, to: number): number {
  return Math.hypot(
    world[from + 12]! - world[to + 12]!,
    world[from + 13]! - world[to + 13]!,
    world[from + 14]! - world[to + 14]!,
  )
}

function applyBodyParameter(pose: Pose, joint: number, hips: number, index: number): void {
  const {
    controlLocal,
    local,
    body: { parameters, rotation },
  } = pose
  const offset = joint * LOCAL_STRIDE
  const axis = index % 3
  if (joint === hips) {
    local[offset + axis] = controlLocal[offset + axis]! + parameters[index]!
    return
  }
  const x = parameters[index - axis]!
  const y = parameters[index - axis + 1]!
  const z = parameters[index - axis + 2]!
  const angle = Math.hypot(x, y, z)
  const scale = angle ? Math.sin(angle / 2) / angle : 0
  rotation[0] = x * scale
  rotation[1] = y * scale
  rotation[2] = z * scale
  rotation[3] = Math.cos(angle / 2)
  multiplyQuaternion(local, offset + 3, controlLocal, offset + 3, rotation, 0)
}

function reachCost(skeleton: CompiledSkeleton, pose: Pose, errors: Float64Array): number {
  const { parents, controls } = skeleton
  const {
    local,
    world,
    body: { point },
  } = pose
  let cost = 0
  for (let limb = 0; limb < errors.length; limb++) {
    errors[limb] = 0
    const weight = pose.targetWeights[limb]!
    if (!weight) continue
    const tip = controls[limb + 3]!
    const middle = parents[tip]!
    const root = parents[middle]!
    const parent = parents[root]!
    const r = root * LOCAL_STRIDE
    const m = middle * LOCAL_STRIDE
    const t = tip * LOCAL_STRIDE
    point.set(pose.targets[limb]!)
    if (parent >= 0 && !toParentSpace(point, world, parent * WORLD_STRIDE)) continue
    const distance = Math.hypot(
      point[0]! - local[r]!,
      point[1]! - local[r + 1]!,
      point[2]! - local[r + 2]!,
    )
    const scale = local[r + 7]!
    const upper = scale * Math.hypot(local[m]!, local[m + 1]!, local[m + 2]!)
    const lower =
      scale *
      Math.hypot(
        local[t]! * local[m + 7]!,
        local[t + 1]! * local[m + 8]!,
        local[t + 2]! * local[m + 9]!,
      )
    const error = distance - Math.max(Math.abs(upper - lower), Math.min(distance, upper + lower))
    // Normalize each constraint to its own limb length, including scaled rigs.
    errors[limb] = error / (upper + lower)
    cost += weight * errors[limb]! ** 2
  }
  return cost
}
