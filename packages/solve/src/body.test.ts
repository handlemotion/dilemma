import type { Clip, Skeleton, Vec3 } from '@dilemma/core'
import { describe, expect, it } from 'vitest'
import {
  compileClip,
  compileSkeleton,
  createPose,
  jointPosition,
  jointRotation,
  solvePose,
} from './index.ts'

const identity = [0, 0, 0, 1] as const
function humanoid(count = 12) {
  const joints: [parent: number, translation: Vec3][] = [
    [-1, [0, 1, 0]],
    [0, [-0.16, 0, 0]],
    [1, [0, -0.45, 0.09]],
    [2, [0, -0.43, -0.09]],
    [0, [0.16, 0, 0]],
    [4, [0, -0.45, 0.09]],
    [5, [0, -0.43, -0.09]],
    [0, [0, 0.23, 0]],
    [7, [0, 0.23, 0]],
    [8, [0.16, 0, 0]],
    [9, [0.27, -0.08, 0.07]],
    [10, [0.23, -0.07, -0.07]],
  ]
  while (joints.length < count) joints.push([8, [0, 0.1, 0]])
  const rig: Skeleton = {
    joints: joints.map(([parent, translation], index) => ({
      parent,
      id: String(index),
      name: String(index),
      rest: { translation, rotation: [...identity], scale: [1, 1, 1] },
    })),
  }
  return compileSkeleton(rig, {
    confirmed: true,
    joints: { hips: 0, chest: 8, leftFoot: 3, rightFoot: 6, rightHand: 11 },
  })
}

const base: Clip = {
  id: 'c',
  name: 'Demo',
  characterId: 'test',
  fps: 30,
  start: 0,
  end: 30,
  tracks: [],
}
const left: Vec3 = [-0.16, 0.12, 0]
const right: Vec3 = [0.16, 0.12, 0]

describe('coupled IK and contacts', () => {
  it('shares a long reach across the torso while holding two feet, and solves out of order within budget', () => {
    const skeleton = humanoid(70)
    const pose = createPose(skeleton)
    const reach: Vec3 = [0.77, 1.36, 0.16]
    const clip = compileClip(
      {
        ...base,
        controls: {
          hips: { frames: [0, 15, 30], values: [0, 1, 0, 0, 0.95, 0.06, 0, 1, 0] },
          rightHand: { frames: [0, 15, 30], values: [0.66, 1.31, 0, ...reach, 0.66, 1.31, 0] },
        },
        pins: {
          leftFoot: { position: left, rotation: [...identity] },
          rightFoot: { position: right, rotation: [...identity] },
        },
      },
      skeleton.count,
    )
    const point: Vec3 = [0, 0, 0]
    for (let frame = 0; frame <= 30; frame += 0.5) {
      solvePose(skeleton, clip, frame, pose)
      for (const [joint, anchor] of [
        [3, left],
        [6, right],
      ] as const) {
        jointPosition(pose, joint, point)
        expect(
          Math.hypot(point[0] - anchor[0], point[1] - anchor[1], point[2] - anchor[2]),
        ).toBeLessThan(0.001)
      }
    }
    solvePose(skeleton, clip, 15, pose)
    jointPosition(pose, 11, point)
    expect(Math.hypot(point[0] - reach[0], point[1] - reach[1], point[2] - reach[2])).toBeLessThan(
      0.002,
    )
    expect(pose.local.slice(7 * 10 + 3, 7 * 10 + 7)).not.toEqual(
      pose.controlLocal.slice(7 * 10 + 3, 7 * 10 + 7),
    )
    const expected = pose.world.slice()
    for (const frame of [30, 0.5, 21, 8, 15]) solvePose(skeleton, clip, frame, pose)
    expect(pose.world).toEqual(expected)
    for (let n = 0; n < 200; n++) solvePose(skeleton, clip, 15, pose)
    const start = performance.now()
    for (let n = 0; n < 500; n++) solvePose(skeleton, clip, 15, pose)
    expect((performance.now() - start) / 500).toBeLessThan(2)
  })

  it('eases a foot plant in and out and composes a hand grip in the prop’s space', () => {
    const skeleton = humanoid()
    const pose = createPose(skeleton)
    const anchor: Vec3 = [-0.19, 0.14, 0.08]
    const clip = compileClip(
      {
        ...base,
        contacts: [
          {
            id: 'plant',
            effector: 'leftFoot',
            start: 10,
            end: 20,
            anchor: { position: anchor, rotation: [...identity] },
          },
          {
            id: 'grip',
            effector: 'rightHand',
            start: 10,
            end: 20,
            anchor: { position: [0.06, 0, 0], rotation: [...identity] },
            prop: { position: [0.63, 1.33, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
          },
        ],
      },
      skeleton.count,
    )
    const point: Vec3 = [0, 0, 0]
    for (const [frame, z] of [
      [0, 0],
      [6, 0],
      [8, 0.04],
      [10, 0.08],
      [15, 0.08],
      [20, 0.08],
      [22, 0.04],
      [24, 0],
    ] as const) {
      solvePose(skeleton, clip, frame, pose)
      jointPosition(pose, 3, point)
      expect(point[2]).toBeCloseTo(z, 7)
    }
    solvePose(skeleton, clip, 10, pose)
    jointPosition(pose, 11, point)
    expect(point[0]).toBeCloseTo(0.63, 6)
    expect(point[1]).toBeCloseTo(1.33, 6)
    expect(point[2]).toBeCloseTo(-0.06, 6)
    const rotation = new Float64Array(4)
    jointRotation(skeleton, pose, 11, rotation)
    expect(Math.abs((rotation[1]! + rotation[3]!) * Math.SQRT1_2)).toBeCloseTo(1, 9)
  })
})
