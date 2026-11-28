import { type Skeleton } from './document.ts'
import type { JointRef } from './editor.ts'

export const EFFECTORS = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as const
export type Effector = (typeof EFFECTORS)[number]

export const RIG_ROLES = ['hips', 'chest', 'head', ...EFFECTORS] as const
export type RigRole = (typeof RIG_ROLES)[number]

const BENDS = ['leftElbow', 'rightElbow', 'leftKnee', 'rightKnee'] as const
export const CONTROL_IDS = [...RIG_ROLES, ...BENDS] as const
export type ControlId = (typeof CONTROL_IDS)[number]

export const CONTROL_LABELS: Record<ControlId, string> = {
  hips: 'Hips',
  chest: 'Chest',
  head: 'Head',
  leftHand: 'Left hand',
  rightHand: 'Right hand',
  leftFoot: 'Left foot',
  rightFoot: 'Right foot',
  leftElbow: 'Left elbow bend',
  rightElbow: 'Right elbow bend',
  leftKnee: 'Left knee bend',
  rightKnee: 'Right knee bend',
}

export interface RigMapping {
  confirmed: boolean
  joints: Partial<Record<RigRole, number>>
}

export function isEffector(id: ControlId): id is Effector {
  return EFFECTORS.some((effector) => effector === id)
}

export function bendControl(effector: Effector): (typeof BENDS)[number] {
  return BENDS[EFFECTORS.indexOf(effector)]!
}

export function controlKind(id: ControlId): 'translation' | 'rotation' | 'target' | 'bend' {
  if (id === 'hips') return 'translation'
  if (id === 'chest' || id === 'head') return 'rotation'
  return isEffector(id) ? 'target' : 'bend'
}

export function controlJoint(skeleton: Skeleton, rig: RigMapping | undefined, id: ControlId) {
  if (!rig?.confirmed) return undefined
  const bend = CONTROL_IDS.indexOf(id) - RIG_ROLES.length
  if (bend < 0) return rig.joints[id as RigRole]
  const tip = rig.joints[EFFECTORS[bend]!]
  return tip === undefined ? undefined : skeleton.joints[tip]?.parent
}

export function selectedControl(
  skeleton: Skeleton,
  rig: RigMapping | undefined,
  { joint, control }: JointRef,
): ControlId | undefined {
  if (control) return controlJoint(skeleton, rig, control) === joint ? control : undefined
  return CONTROL_IDS.find((id) => controlJoint(skeleton, rig, id) === joint)
}

export function canMapJoint(skeleton: Skeleton, role: RigRole, joint: number): boolean {
  if (!Number.isInteger(joint) || !skeleton.joints[joint]) return false
  if (!isEffector(role)) return true
  const middle = skeleton.joints[joint]!.parent
  const root = skeleton.joints[middle]?.parent ?? -1
  return (
    root >= 0 &&
    [joint, middle].every((index) => Math.hypot(...skeleton.joints[index]!.rest.translation) > 0)
  )
}

export function validRigMapping(skeleton: Skeleton, { joints }: RigMapping): boolean {
  const matched = new Set<number>()
  for (const [role, joint] of Object.entries(joints)) {
    if (
      !RIG_ROLES.some((id) => id === role) ||
      !canMapJoint(skeleton, role as RigRole, joint) ||
      matched.has(joint)
    )
      return false
    matched.add(joint)
  }
  return true
}

export function suggestRig(skeleton: Skeleton): RigMapping {
  const names = skeleton.joints.map(({ name }) => {
    const short = name.split(/[:|]/).at(-1)!
    return short
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/(?:[._ -]+(?:joint|jnt|bnd|bind|def|deform|skn))+$/, '')
  })
  const parents = new Set(skeleton.joints.map(({ parent }) => parent))
  const joints: RigMapping['joints'] = {}
  for (const role of RIG_ROLES) {
    const scores = names.map((name, joint) =>
      canMapJoint(skeleton, role, joint) ? matchScore(name, role, !parents.has(joint)) : 0,
    )
    const best = scores.reduce((highest, score) => Math.max(highest, score), 0)
    const joint = scores.indexOf(best)
    if (best > 0 && joint === scores.lastIndexOf(best) && !Object.values(joints).includes(joint)) {
      joints[role] = joint
    }
  }
  return { joints, confirmed: RIG_ROLES.every((role) => joints[role] !== undefined) }
}

function matchScore(name: string, role: RigRole, leaf: boolean): number {
  const words = name.split(/[^a-z0-9]+/).filter(Boolean)
  const compact = words.join('').replace(/^mixamorig/, '')
  if (role === 'hips') {
    if (/^(hips?|pelvis)\d*$/.test(compact)) return 4
    if (
      words.some((w) => /^(hips?|pelvis)$/.test(w)) &&
      !words.some((word) => /^(?:l|r|left|right|partial|helper)$/.test(word))
    )
      return 2
    return /torsojoint0?1$/.test(compact) ? 1 : 0
  }
  if (role === 'chest') {
    if (/^(upperchest|chestup|chestupper)(?:joint)?$/.test(compact)) return 4
    if (words.includes('chest') || words.includes('chestroot') || compact === 'chest') return 3
    if (/spine0?3/.test(compact)) return 2
    return /torsojoint0?3$|spine0?2/.test(compact) ? 1 : 0
  }
  if (role === 'head') return words.includes('head') || /^head\d*$/.test(compact) ? 1 : 0
  const side = role.startsWith('left') ? 'left' : 'right'
  const short = side[0]!
  const hand = role.endsWith('Hand')
  const primary = hand ? 'hand' : 'foot'
  const secondary = hand ? 'wrist' : 'ankle'
  if (words.some((word) => /^(?:corrective|corr|twist|roll|helper|partial)$/.test(word))) return 0
  const exact = (part: string) =>
    new RegExp(`^(?:${side}|${short})${part}(?:0?1)?$|^${part}(?:${side}|${short})$`).test(compact)
  if (exact(primary)) return 5
  if (exact(secondary)) return 4
  if (!words.some((word) => word === side || word === short)) return 0
  if (words.some((word) => new RegExp(`^${primary}(?:0?1)?$`).test(word))) return 3
  if (words.some((word) => new RegExp(`^${secondary}(?:0?1)?$`).test(word))) return 2
  if (!hand) return new RegExp(`legjoint${short}0?3$`).test(compact) ? 1 : 0
  return leaf && /armjoint/.test(compact) ? 1 : 0
}
