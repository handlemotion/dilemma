import {
  addClip,
  axisCurves,
  deleteClipKeys,
  findCharacter,
  keyFrames,
  keyChannel,
  setAxisCurves,
  setLimbTargetKey,
  setTransformKeys,
  TRANSFORM_CHANNELS,
  type Clip,
  type AxisCurves,
  type JointKey,
  type JointRef,
  type TransformKey,
  type PoseKey,
} from '@dilemma/core'
import {
  canSolveLimb,
  compileClip,
  compilePosePreview,
  compileSkeleton,
  createPose,
  jointPosition,
  LOCAL_STRIDE,
  sampleClip,
  solvePose,
} from '@dilemma/solve'
import { editor } from './editor.ts'
import { useUi, type TransformDraft } from './ui-store.ts'

export function selectJoints(joints: JointRef[]): void {
  const first = joints[0]
  if (first && joints.every((joint) => joint.characterId === first.characterId)) {
    const { doc, playhead } = editor.getState()
    const active = doc.clips.find((clip) => clip.id === playhead.clipId)
    if (active?.characterId !== first.characterId) {
      const clip = doc.clips.find((entry) => entry.characterId === first.characterId)
      editor.setPlayhead({ clipId: clip?.id ?? null, frame: clip?.start ?? doc.sceneTiming.start })
    }
  }
  editor.select(joints)
}

export function activeClip(): Clip | undefined {
  const { doc, playhead } = editor.getState()
  return doc.clips.find((clip) => clip.id === playhead.clipId)
}

function blankClip(characterId: string): Clip {
  const { doc } = editor.getState()
  const names = new Set(doc.clips.map((clip) => clip.name))
  let number = 1
  while (names.has(`Animation ${number}`)) number++
  return {
    id: crypto.randomUUID(),
    characterId,
    name: `Animation ${number}`,
    ...doc.sceneTiming,
    tracks: [],
  }
}

export function newClip(): void {
  const { doc, selection } = editor.getState()
  const characterId =
    selection.joints[0]?.characterId ?? activeClip()?.characterId ?? doc.characters[0]?.id
  if (!characterId) return
  const clip = blankClip(characterId)
  useUi.getState().setPlaying(false)
  editor.run(addClip(clip))
  editor.setPlayhead({ clipId: clip.id, frame: clip.start })
}

function keyFrame(joint: JointRef): number {
  const clip = activeClip()
  if (!clip) return useUi.getState().previewFrame
  if (clip.characterId !== joint.characterId) return editor.getState().doc.sceneTiming.start
  return editor.getState().playhead.frame
}

type LimbKey = { joint: number; key: Extract<PoseKey, { channel: 'ikTarget' }> }

function runKey(characterId: string, frame: number, changes: readonly JointKey[] | LimbKey): void {
  const clip = activeClip()
  const target = clip?.characterId === characterId ? clip.id : blankClip(characterId)
  const ui = useUi.getState()
  const keyed = 'key' in changes ? [changes] : changes
  const remaining = ui.unkeyedTransforms.filter(({ joint, key }) =>
    joint.characterId === characterId
      ? !keyed.some((change) => change.joint === joint.joint && change.key.channel === key.channel)
      : typeof target === 'string',
  )
  editor.run(
    'key' in changes
      ? setLimbTargetKey(target, changes.joint, frame, changes.key.value)
      : setTransformKeys(target, frame, changes),
  )
  if (typeof target !== 'string') editor.setPlayhead({ clipId: target.id, frame })
  if (remaining.length) ui.setUnkeyedTransforms(remaining)
}

export function keySelection(): void {
  const { doc, selection } = editor.getState()
  const clip = activeClip()
  const lead =
    selection.joints.find((joint) => joint.characterId === clip?.characterId) ?? selection.joints[0]
  const character = lead && findCharacter(doc, lead.characterId)
  const ui = useUi.getState()
  if (!lead || !character || ui.transformDraft) return
  ui.setPlaying(false)
  const frame = keyFrame(lead)
  const skeleton = compileSkeleton(character.skeleton)
  const compiled = clip?.characterId === character.id ? compileClip(clip, skeleton.count) : null
  const unkeyed = ui.unkeyedTransforms
    .filter(({ joint }) => joint.characterId === character.id)
    .map(({ joint, key }) => ({ joint: joint.joint, key }))
  if (ui.transformMode === 'ik') {
    if (selection.joints.length !== 1 || (compiled?.limb && compiled.limb.tip !== lead.joint))
      return
    const pose = createPose(skeleton)
    solvePose(
      skeleton,
      compiled,
      frame,
      pose,
      unkeyed.length ? compilePosePreview(skeleton.count, unkeyed) : undefined,
    )
    if (pose.ik.tip >= 0 && pose.ik.tip !== lead.joint) return
    if (!canSolveLimb(skeleton, pose, lead.joint)) return
    const target: [number, number, number] = [0, 0, 0]
    if (pose.ik.tip === lead.joint) {
      target[0] = pose.ik.target[0]!
      target[1] = pose.ik.target[1]!
      target[2] = pose.ik.target[2]!
    } else jointPosition(pose, lead.joint, target)
    runKey(character.id, frame, { joint: lead.joint, key: { channel: 'ikTarget', value: target } })
    return
  }
  // Sample the authored FK channels rather than keying the IK-adjusted pose.
  const local = skeleton.rest.slice()
  if (compiled) sampleClip(compiled, frame, local)
  const keys = selection.joints
    .filter(({ characterId }) => characterId === character.id)
    .flatMap(({ joint }): JointKey[] => {
      const edits = unkeyed.flatMap((edit): JointKey[] =>
        edit.joint === joint && edit.key.channel !== 'ikTarget' ? [{ joint, key: edit.key }] : [],
      )
      if (edits.length) return edits
      const o = joint * LOCAL_STRIDE
      const key: TransformKey =
        ui.transformMode === 'translate'
          ? { channel: 'translations', value: [local[o]!, local[o + 1]!, local[o + 2]!] }
          : ui.transformMode === 'scale'
            ? { channel: 'scales', value: [local[o + 7]!, local[o + 8]!, local[o + 9]!] }
            : {
                channel: 'rotations',
                value: [local[o + 3]!, local[o + 4]!, local[o + 5]!, local[o + 6]!],
              }
      return [{ joint, key }]
    })
  runKey(character.id, frame, keys)
}

function keyDeletion() {
  const clip = activeClip()
  if (!clip) return undefined
  const { timelineRange: range } = useUi.getState()
  if (!range || range.clipId !== clip.id || range.rowId === 'preview') return undefined

  const start = Math.min(range.anchor, range.edge)
  const end = Math.max(range.anchor, range.edge)
  const { doc } = editor.getState()
  const joints =
    range.rowId === 'character'
      ? clip.tracks.map((track) => track.joint)
      : range.rowId === 'ik'
        ? []
        : [
            findCharacter(doc, clip.characterId)?.skeleton.joints.findIndex(
              (joint) => `joint:${joint.id}` === range.rowId,
            ) ?? -1,
          ]
  const limb = range.rowId === 'character' || range.rowId === 'ik'
  const hasLimbKeys =
    limb && keyFrames(clip.limb?.targets).some((frame) => frame >= start && frame <= end)
  if (
    !hasLimbKeys &&
    !clip.tracks.some(
      (track) =>
        joints.includes(track.joint) &&
        TRANSFORM_CHANNELS.some((channel) =>
          keyFrames(track[channel]).some((frame) => frame >= start && frame <= end),
        ),
    )
  )
    return undefined
  return { clipId: clip.id, joints, start, end, limb }
}

export function deleteKeys(): boolean {
  const ui = useUi.getState()
  if (ui.timelineMode === 'curves' && ui.curveTarget) {
    const clip = activeClip()
    const { clipId, joint, property } = ui.curveTarget
    if (clip?.id !== clipId || !ui.curveSelection.length) return false
    const source = axisCurves(keyChannel(clip, joint, property), property)
    const curves = source.map((keys, axis) =>
      keys.filter(
        (key) =>
          !ui.curveSelection.some((point) => point.axis === axis && point.frame === key.frame),
      ),
    ) as AxisCurves
    if (curves.every((keys, axis) => keys.length === source[axis]?.length)) return false
    ui.setPlaying(false)
    if (ui.curveProperty !== property) ui.setCurveProperty(property)
    editor.run(setAxisCurves(clipId, joint, property, curves, 'Delete curve keys'))
    ui.setCurveSelection([])
    return true
  }
  const target = keyDeletion()
  if (!target) return false
  ui.setPlaying(false)
  editor.run(
    deleteClipKeys(target.clipId, target.joints, target.start, target.end, { limb: target.limb }),
  )
  ui.setTimelineRange(null)
  return true
}

export function beginTransform(joint: JointRef) {
  const ui = useUi.getState()
  ui.setPlaying(false)
  let draft: TransformDraft = { joint, frame: keyFrame(joint), key: null }
  ui.setTransformDraft(draft)
  return {
    preview(key: PoseKey | null) {
      if (useUi.getState().transformDraft !== draft) return
      draft = { ...draft, key }
      ui.setTransformDraft(draft)
    },
    finish(commit: boolean, forceKey = false) {
      const current = useUi.getState()
      if (current.transformDraft !== draft) return
      current.setTransformDraft(null)
      const key = draft.key
      if (!commit || !key) return
      if (forceKey || current.autoKey) {
        runKey(
          joint.characterId,
          draft.frame,
          key.channel === 'ikTarget' ? { joint: joint.joint, key } : [{ joint: joint.joint, key }],
        )
        return
      }
      const remaining = current.unkeyedTransforms.filter(
        (edit) =>
          edit.joint.characterId !== joint.characterId ||
          edit.key.channel !== key.channel ||
          (key.channel !== 'ikTarget' && edit.joint.joint !== joint.joint),
      )
      current.setUnkeyedTransforms([...remaining, { joint, key }])
    },
  }
}
