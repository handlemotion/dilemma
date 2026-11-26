import type { Clip, Skeleton } from '@dilemma/core'
import { describe, expect, it } from 'vitest'
import { solvePose } from './pose.ts'
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
      tracks: [{ joint: 1, frames: [0, 10], rotations: [0, 0, 0, 1, 0, 0, s, s] }],
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

  it('rejects joints that come before their parent', () => {
    const skeleton = chain(2)
    skeleton.joints[0]!.parent = 1
    expect(() => compileSkeleton(skeleton)).toThrow()
  })

  it('solves a 70-joint humanoid in under 2 ms', () => {
    const joints = 70
    const skeleton = compileSkeleton(chain(joints))
    const clip = compileClip(randomClip(joints, 11), joints)
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
      frames,
      rotations: frames.flatMap(() => {
        const q = [random(), random(), random(), random()]
        const len = Math.hypot(...q)
        return q.map((v) => v / len)
      }),
      translations: frames.flatMap(() => [random() * 0.01, 0.1, random() * 0.01]),
    })),
  }
}
