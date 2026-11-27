import {
  addClip,
  deleteTransformKeys,
  findCharacter,
  setTransformKeys,
  TRANSFORM_CHANNELS,
  type Clip,
  type JointKey,
  type JointRef,
  type TransformKey,
} from '@dilemma/core'
import { compileClip, compileSkeleton, createPose, LOCAL_STRIDE, solvePose } from '@dilemma/solve'
import { editor } from './editor.ts'
import { PREVIEW_END, PREVIEW_FPS, useUi, type TransformDraft } from './ui-store.ts'

export function selectJoints(joints: JointRef[]): void {
  const first = joints[0]
  if (first && joints.every((joint) => joint.characterId === first.characterId)) {
    const { doc, playhead } = editor.getState()
    const active = doc.clips.find((clip) => clip.id === playhead.clipId)
    if (active?.characterId !== first.characterId) {
      const clip = doc.clips.find((entry) => entry.characterId === first.characterId)
      editor.setPlayhead({ clipId: clip?.id ?? null, frame: clip?.start ?? 0 })
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
    fps: PREVIEW_FPS,
    start: 0,
    end: PREVIEW_END,
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
  if (clip.characterId !== joint.characterId) return 0
  return editor.getState().playhead.frame
}

function keyTransforms(characterId: string, frame: number, keys: JointKey[]): void {
  const clip = activeClip()
  const target = clip?.characterId === characterId ? clip.id : blankClip(characterId)
  editor.run(setTransformKeys(target, frame, keys))
  if (typeof target !== 'string') editor.setPlayhead({ clipId: target.id, frame })
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
  const pose = createPose(skeleton)
  solvePose(
    skeleton,
    clip?.characterId === character.id ? compileClip(clip, skeleton.count) : null,
    frame,
    pose,
  )
  const local = pose.local
  const keys = selection.joints
    .filter(({ characterId }) => characterId === character.id)
    .map(({ joint }): JointKey => {
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
      return { joint, key }
    })
  keyTransforms(character.id, frame, keys)
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
      : [
          findCharacter(doc, clip.characterId)?.skeleton.joints.findIndex(
            (joint) => `joint:${joint.id}` === range.rowId,
          ) ?? -1,
        ]
  if (
    !clip.tracks.some(
      (track) =>
        joints.includes(track.joint) &&
        TRANSFORM_CHANNELS.some((channel) =>
          track[channel]?.frames.some((frame) => frame >= start && frame <= end),
        ),
    )
  )
    return undefined
  return { clipId: clip.id, joints, start, end }
}

export function deleteKeys(): boolean {
  const target = keyDeletion()
  if (!target) return false
  const ui = useUi.getState()
  ui.setPlaying(false)
  editor.run(deleteTransformKeys(target.clipId, target.joints, target.start, target.end))
  ui.setTimelineRange(null)
  return true
}

export function beginTransform(joint: JointRef) {
  const ui = useUi.getState()
  ui.setPlaying(false)
  let draft: TransformDraft = { joint, frame: keyFrame(joint), key: null }
  ui.setTransformDraft(draft)
  return {
    preview(key: TransformKey | null) {
      if (useUi.getState().transformDraft !== draft) return
      draft = { ...draft, key }
      ui.setTransformDraft(draft)
    },
    finish(commit: boolean) {
      if (useUi.getState().transformDraft !== draft) return
      ui.setTransformDraft(null)
      if (commit && draft.key) {
        keyTransforms(joint.characterId, draft.frame, [{ joint: joint.joint, key: draft.key }])
      }
    },
  }
}
