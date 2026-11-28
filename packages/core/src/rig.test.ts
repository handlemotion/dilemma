import { expect, it } from 'vitest'
import type { Skeleton } from './document.ts'
import { suggestRig } from './rig.ts'

it('matches a Maya-style deform rig without choosing its similarly named helper joints', () => {
  const names = [
    'asset:root_JNT',
    'asset:hip_JNT',
    'L_hip_partial_JNT',
    'spine_3_JNT',
    'chest_JNT',
    'chest_up_JNT',
    'head_JNT',
    'L_upleg_JNT',
    'L_lowleg_JNT',
    'L_foot_JNT',
    'L_ankle_JNT',
    'R_upleg_JNT',
    'R_lowleg_JNT',
    'R_foot_JNT',
    'L_uparm_JNT',
    'L_lowarm_JNT',
    'L_hand_JNT',
    'L_wrist_JNT',
    'R_uparm_JNT',
    'R_lowarm_JNT',
    'R_hand_JNT',
    'foot_secondary_mid',
  ]
  const parents = [-1, 0, 1, 1, 3, 4, 5, 1, 7, 8, 8, 1, 11, 12, 5, 14, 15, 15, 5, 18, 19, -1]
  const skeleton: Skeleton = {
    joints: names.map((name, i) => ({
      id: `j${i}`,
      name,
      parent: parents[i]!,
      rest: { translation: [0, 0.1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    })),
  }
  expect(suggestRig(skeleton)).toEqual({
    confirmed: true,
    joints: { hips: 1, chest: 5, head: 6, leftHand: 16, rightHand: 20, leftFoot: 9, rightFoot: 13 },
  })
  skeleton.joints.push({ ...skeleton.joints[9]!, id: 'duplicate', name: 'second:L_foot_JNT' })
  const ambiguous = suggestRig(skeleton)
  expect(ambiguous.confirmed).toBe(false)
  expect(ambiguous.joints.leftFoot).toBeUndefined()
  expect(ambiguous.joints.rightFoot).toBe(13)
})
