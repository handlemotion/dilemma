import {
  CONTROL_IDS,
  CONTROL_LABELS,
  controlJoint,
  EFFECTORS,
  handEffector,
  type Contact,
  type Effector,
  keyFrames,
  TRANSFORM_CHANNELS,
  type ControlId,
  type Character,
  type Clip,
  type JointRef,
} from '@dilemma/core'

export const TRACK_HEIGHT = 36
export const TIMELINE_HEADER_HEIGHT = 36
export const DEFAULT_TIMELINE_HEIGHT = TIMELINE_HEADER_HEIGHT + TRACK_HEIGHT + 1
export const MIN_CURVE_TIMELINE_HEIGHT = 176
export const DEFAULT_CURVE_TIMELINE_HEIGHT = 264

export type TimelineRowId =
  | 'preview'
  | 'character'
  | 'ik'
  | `contact:${Effector}`
  | `joint:${string}`
  | `control:${ControlId}`

export interface TimelineRow {
  id: TimelineRowId
  name: string
  joint: number | null
  control?: ControlId
  depth: number
  frames: readonly number[]
  contacts?: Contact[]
}

export const PREVIEW_ROW: TimelineRow = {
  id: 'preview',
  name: '',
  joint: null,
  depth: 0,
  frames: [],
}

export function timelineRows(character: Character, clip: Clip): TimelineRow[] {
  const joints = character.skeleton.joints
  const summary = new Set<number>()
  const framesByJoint = new Map<number, Set<number>>()
  for (const track of clip.tracks) {
    if (!joints[track.joint]) continue
    const frames = framesByJoint.get(track.joint) ?? new Set<number>()
    framesByJoint.set(track.joint, frames)
    for (const channel of TRANSFORM_CHANNELS) {
      for (const frame of keyFrames(track[channel])) {
        if (frame < clip.start || frame > clip.end) continue
        summary.add(frame)
        frames.add(frame)
      }
    }
  }

  const limb = clip.limb
  const tip = limb && joints[limb.tip]
  const targetFrames = keyFrames(limb?.targets)
  for (const frame of targetFrames) summary.add(frame)
  const controls = CONTROL_IDS.flatMap((id): TimelineRow[] => {
    const frames = keyFrames(clip.controls?.[id])
    if (!frames.length) return []
    for (const frame of frames) summary.add(frame)
    return [
      {
        id: `control:${id}`,
        name: CONTROL_LABELS[id],
        control: id,
        depth: 1,
        frames,
        joint: controlJoint(character.skeleton, character.rig, id) ?? null,
      },
    ]
  })
  const contacts = EFFECTORS.flatMap((effector): TimelineRow[] => {
    const entries = clip.contacts?.filter((contact) => contact.effector === effector)
    if (!entries?.length) return []
    return [
      {
        id: `contact:${effector}`,
        name: `${CONTROL_LABELS[effector]} ${handEffector(effector) ? 'grips' : 'plants'}`,
        control: effector,
        joint: controlJoint(character.skeleton, character.rig, effector) ?? null,
        depth: 1,
        frames: [],
        contacts: entries,
      },
    ]
  })
  const rows: TimelineRow[] = [
    { id: 'character', name: character.name, joint: null, depth: 0, frames: sortedFrames(summary) },
    ...contacts,
    ...controls,
  ]
  if (limb && tip) {
    rows.push({
      id: 'ik',
      name: `${tip.name} IK target`,
      joint: limb.tip,
      depth: 1,
      frames: targetFrames,
    })
  }
  const roots: number[] = []
  const children: number[][] = joints.map(() => [])
  joints.forEach(({ parent }, index) => {
    if (parent < 0) roots.push(index)
    else children[parent]!.push(index)
  })

  const pending = roots.toReversed().map((joint) => ({ joint, depth: 1 }))
  while (pending.length > 0) {
    const { joint, depth } = pending.pop()!
    const { id, name } = joints[joint]!
    rows.push({
      id: `joint:${id}`,
      name,
      joint,
      depth,
      frames: sortedFrames(framesByJoint.get(joint)),
    })
    for (const child of children[joint]!.toReversed())
      pending.push({ joint: child, depth: depth + 1 })
  }
  return rows
}

function sortedFrames(frames?: Set<number>): number[] {
  return frames ? [...frames].toSorted((a, b) => a - b) : []
}

/** The first row stays pinned. Only joint rows move with the scroll offset. */
export function timelineRowAt(
  rows: readonly TimelineRow[],
  bodyY: number,
  scrollTop: number,
): TimelineRow | undefined {
  if (bodyY < 0) return undefined
  const index = bodyY < TRACK_HEIGHT ? 0 : Math.floor((bodyY + scrollTop) / TRACK_HEIGHT)
  return rows[index]
}

export function timelineHeight(jointCount: number, expanded: boolean, resizedHeight?: number) {
  if (!expanded || jointCount === 0) return resizedHeight ?? DEFAULT_TIMELINE_HEIGHT
  const defaultHeight = DEFAULT_TIMELINE_HEIGHT + Math.min(jointCount, 4) * TRACK_HEIGHT
  return Math.max(DEFAULT_TIMELINE_HEIGHT + TRACK_HEIGHT, resizedHeight ?? defaultHeight)
}

/** The closest key strictly before or after the playhead, in the active clip. */
export function keyframeInDirection(
  clip: Clip,
  frame: number,
  direction: -1 | 1,
  selection: readonly JointRef[],
  character?: Character,
): number | undefined {
  const joints = new Set(
    selection.filter((ref) => ref.characterId === clip.characterId).map((ref) => ref.joint),
  )
  const inClip = (key: number) => key >= clip.start && key <= clip.end
  let nearest: number | undefined
  function consider(frames: readonly number[]) {
    const candidate =
      direction === -1
        ? frames.findLast((key) => key < frame && inClip(key))
        : frames.find((key) => key > frame && inClip(key))
    if (candidate !== undefined && (nearest === undefined || (candidate - nearest) * direction < 0))
      nearest = candidate
  }
  for (const id of CONTROL_IDS) {
    const joint = character ? controlJoint(character.skeleton, character.rig, id) : undefined
    if (
      joints.size === 0 ||
      selection.some(
        (ref) =>
          ref.characterId === clip.characterId &&
          (ref.control ? ref.control === id : ref.joint === joint),
      )
    )
      consider(keyFrames(clip.controls?.[id]))
  }
  const limb = clip.limb
  if (limb && (joints.size === 0 || joints.has(limb.tip))) consider(keyFrames(limb.targets))
  for (const track of clip.tracks) {
    if (joints.size > 0 && !joints.has(track.joint)) continue
    for (const channel of TRANSFORM_CHANNELS) consider(keyFrames(track[channel]))
  }
  return nearest
}
