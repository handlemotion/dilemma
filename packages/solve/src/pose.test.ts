import type { Clip, Skeleton, Vec3 } from '@dilemma/core'
import { describe, expect, it } from 'vitest'
import { compilePosePreview, jointRotation, solvePose } from './pose.ts'
import { compileClip, compileSkeleton, createPose, WORLD_STRIDE } from './skeleton.ts'

const s = Math.SQRT1_2

/** A straight chain of `n` joints along +Y, 0.1 m apart. */
function chain(n: number): Skeleton {
  return {
    joints: Array.from({ length: n }, (_, i) => ({
      id: `j${i}`,
      name: `j${i}`,
      parent: i - 1,
      rest: { translation: [0, i === 0 ? 1 : 0.1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    })),
  }
}

function position(world: Float64Array, joint: number): number[] {
  const o = joint * WORLD_STRIDE
  return [world[o + 12]!, world[o + 13]!, world[o + 14]!]
}

describe('solvePose', () => {
  it('composes rest transforms down the chain', () => {
    const skeleton = compileSkeleton(chain(3))
    const pose = createPose(skeleton)
    solvePose(skeleton, null, 0, pose)
    const [x, y, z] = position(pose.world, 2)
    expect([x, z]).toEqual([0, 0])
    expect(y).toBeCloseTo(1.2, 12)
  })

  it('rotates children with their parent', () => {
    // 90 degrees about Z on joint 1 swings joint 2 from +Y to -X.
    const clip: Clip = {
      id: 'c',
      name: 'c',
      characterId: 'x',
      fps: 30,
      start: 0,
      end: 10,
      tracks: [{ joint: 1, rotations: { frames: [0, 10], values: [0, 0, 0, 1, 0, 0, s, s] } }],
    }
    const skeleton = compileSkeleton(chain(3))
    const compiled = compileClip(clip, 3)
    const pose = createPose(skeleton)

    solvePose(skeleton, compiled, 10, pose)
    const [x, y, z] = position(pose.world, 2)
    expect(x).toBeCloseTo(-0.1, 12)
    expect(y).toBeCloseTo(1.1, 12)
    expect(z).toBeCloseTo(0, 12)

    // Halfway is 45 degrees, from slerp.
    solvePose(skeleton, compiled, 5, pose)
    const [hx, hy] = position(pose.world, 2)
    expect(hx).toBeCloseTo(-0.1 * Math.sin(Math.PI / 4), 12)
    expect(hy).toBeCloseTo(1.1 + 0.1 * Math.cos(Math.PI / 4), 12)

    // Before the first key and after the last, it holds.
    solvePose(skeleton, compiled, 40, pose)
    expect(position(pose.world, 2)[0]).toBeCloseTo(-0.1, 12)
  })

  it('is deterministic', () => {
    const skeleton = compileSkeleton(chain(20))
    const clip = compileClip(randomClip(20, 3), 20)
    const a = createPose(skeleton)
    const b = createPose(skeleton)
    solvePose(skeleton, clip, 17, a)
    solvePose(skeleton, clip, 3, b)
    solvePose(skeleton, clip, 17, b)
    expect(Array.from(b.world)).toEqual(Array.from(a.world))
  })

  it('pins the interpolated IK target under a rotated, nonuniformly scaled ancestor', () => {
    const source = chain(5)
    source.joints[0]!.rest.scale = [2, 3, 0.5]
    source.joints[0]!.rest.rotation = [0, s, 0, s]
    const skeleton = compileSkeleton(source)
    const clip = compileClip(
      {
        id: 'ik',
        name: 'IK',
        characterId: 'x',
        fps: 30,
        start: 0,
        end: 10,
        tracks: [{ joint: 0, translations: { frames: [0, 10], values: [0, 1, 0, 0.02, 1, 0] } }],
        limb: { tip: 3, targets: { frames: [0, 10], values: [0, 1.6, -0.1, 0.04, 1.6, -0.1] } },
      },
      5,
    )
    const pose = createPose(skeleton)
    solvePose(skeleton, clip, 5, pose)
    const wrist = position(pose.world, 3)
    for (const [i, value] of [0.02, 1.6, -0.1].entries()) expect(wrist[i]).toBeCloseTo(value, 10)
    expect(position(pose.world, 4)).not.toEqual(wrist)
    const solved = pose.world.slice()
    solvePose(skeleton, clip, 0, pose)
    solvePose(skeleton, clip, 5, pose)
    expect(pose.world).toEqual(solved)
  })

  it('clamps targets on either side of the reachable range while preserving segment lengths', () => {
    const source = chain(3)
    source.joints[1]!.rest.translation = [0, 0.2, 0]
    const skeleton = compileSkeleton(source)
    const pose = createPose(skeleton)
    for (const [value, expectedY] of [
      [[0, 0, 0], 0.7],
      [[0, 0.99, 0], 0.9],
      [[0, 1, 0], 1.1],
    ] satisfies [Vec3, number][]) {
      const preview = compilePosePreview(skeleton.count, [
        { joint: 2, key: { channel: 'ikTarget', value } },
      ])
      solvePose(skeleton, null, 0, pose, preview)
      const [x, y, z] = position(pose.world, 2)
      const [mx, my, mz] = position(pose.world, 1)
      expect(x).toBeCloseTo(0, 10)
      expect(y).toBeCloseTo(expectedY, 10)
      expect(z).toBeCloseTo(0, 10)
      expect(Math.hypot(mx!, my! - 1, mz!)).toBeCloseTo(0.2, 10)
      expect(Math.hypot(x! - mx!, y! - my!, z! - mz!)).toBeCloseTo(0.1, 10)
    }
  })

  it('holds two feet under keyed hips and aims an authored knee bend independently', () => {
    const rig = chain(7)
    rig.joints[1]!.rest.translation = [-0.15, 0, 0]
    rig.joints[4]!.rest.translation = [0.15, 0, 0]
    rig.joints[4]!.parent = 0
    for (const joint of [2, 5]) rig.joints[joint]!.rest.translation = [0, -0.4, 0.04]
    for (const joint of [3, 6]) rig.joints[joint]!.rest.translation = [0, -0.4, -0.04]
    const skeleton = compileSkeleton(rig, {
      confirmed: true,
      joints: { hips: 0, leftFoot: 3, rightFoot: 6 },
    })
    const left: Vec3 = [-0.15, 0.2, 0]
    const right: Vec3 = [0.15, 0.2, 0]
    const clip = compileClip(
      {
        id: 'c',
        name: 'Pose',
        characterId: 'x',
        fps: 30,
        start: 0,
        end: 10,
        tracks: [],
        controls: {
          hips: { frames: [0, 10], values: [0, 1, 0, 0, 0.85, 0] },
          rightKnee: { frames: [0], values: [0.15, 0.6, -0.4] },
        },
        pins: {
          leftFoot: { position: left, rotation: [0, 0, 0, 1] },
          rightFoot: { position: right, rotation: [0, s, 0, s] },
        },
      },
      skeleton.count,
    )
    const pose = createPose(skeleton)
    for (const frame of [10, 0, 5, 10]) {
      solvePose(skeleton, clip, frame, pose)
      expect(position(pose.world, 0)[1]).toBeCloseTo(1 - 0.015 * frame)
      for (const [joint, point] of [
        [3, left],
        [6, right],
      ] as const) {
        position(pose.world, joint).forEach((value, axis) =>
          expect(value).toBeCloseTo(point[axis]!, 10),
        )
      }
      const orientation = new Float64Array(4)
      jointRotation(skeleton, pose, 6, orientation)
      expect(Math.abs(s * (orientation[1]! + orientation[3]!))).toBeCloseTo(1, 10)
      expect(position(pose.world, 2)[2]).toBeGreaterThan(0.03)
      expect(position(pose.world, 5)[2]).toBeLessThan(-0.03)
    }
  })

  it('rejects joints that come before their parent', () => {
    const skeleton = chain(2)
    skeleton.joints[0]!.parent = 1
    expect(() => compileSkeleton(skeleton)).toThrow()
  })

  it('solves a 70-joint humanoid in under 2 ms', () => {
    const joints = 70
    const skeleton = compileSkeleton(chain(joints))
    const clip = compileClip(
      {
        ...randomClip(joints, 11),
        limb: { tip: 2, targets: { frames: [0], values: [0, 0.25, 0.04] } },
      },
      joints,
    )
    const pose = createPose(skeleton)
    for (let f = 0; f < 200; f++) solvePose(skeleton, clip, f % 120, pose) // warm up
    const runs = 1000
    const start = performance.now()
    for (let i = 0; i < runs; i++) solvePose(skeleton, clip, (i * 7) % 120, pose)
    const perSolve = (performance.now() - start) / runs
    expect(perSolve).toBeLessThan(2)
  })
})

/** Keys every frame on every joint, as an imported clip would have. */
function randomClip(joints: number, seed: number): Clip {
  let state = seed
  const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const frames = Array.from({ length: 121 }, (_, i) => i)
  return {
    id: 'r',
    name: 'r',
    characterId: 'x',
    fps: 30,
    start: 0,
    end: 120,
    tracks: Array.from({ length: joints }, (_, joint) => ({
      joint,
      rotations: {
        frames,
        values: frames.flatMap(() => {
          const q = [random(), random(), random(), random()]
          const len = Math.hypot(...q)
          return q.map((v) => v / len)
        }),
      },
      translations: {
        frames,
        values: frames.flatMap(() => [random() * 0.01, 0.1, random() * 0.01]),
      },
    })),
  }
}
