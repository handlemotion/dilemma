import {
  addClip,
  deleteTransformKeys,
  findCharacter,
  setTransformKey,
  TRANSFORM_CHANNELS,
  type Clip,
  type JointRef,
  type TransformKey,
} from '@dilemma/core'
import { compileClip, compileSkeleton, createPose, LOCAL_STRIDE, solvePose } from '@dilemma/solve'
import { editor } from './editor.ts'
import { PREVIEW_END, PREVIEW_FPS, useUi } from './ui-store.ts'

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

function keyTransform(joint: JointRef, frame: number, key: TransformKey): void {
  const clip = activeClip()
  const target = clip?.characterId === joint.characterId ? clip.id : blankClip(joint.characterId)
  editor.run(setTransformKey(target, joint.joint, frame, key))
  if (typeof target !== 'string') editor.setPlayhead({ clipId: target.id, frame })
}

export function keySelection(): void {
  const { doc, selection } = editor.getState()
  const joint = selection.joints.length === 1 ? selection.joints[0] : undefined
  const character = joint && findCharacter(doc, joint.characterId)
  const ui = useUi.getState()
  if (!joint || !character || ui.transformDraft) return
  ui.setPlaying(false)
  const clip = activeClip()
  const frame = keyFrame(joint)
  const skeleton = compileSkeleton(character.skeleton)
  const pose = createPose(skeleton)
  solvePose(
    skeleton,
    clip?.characterId === character.id ? compileClip(clip, skeleton.count) : null,
    frame,
    pose,
  )
  const o = joint.joint * LOCAL_STRIDE
  const local = pose.local
  const key: TransformKey =
    ui.transformMode === 'translate'
      ? { channel: 'translations', value: [local[o]!, local[o + 1]!, local[o + 2]!] }
      : ui.transformMode === 'scale'
        ? { channel: 'scales', value: [local[o + 7]!, local[o + 8]!, local[o + 9]!] }
        : {
            channel: 'rotations',
            value: [local[o + 3]!, local[o + 4]!, local[o + 5]!, local[o + 6]!],
          }
  keyTransform(joint, frame, key)
}

function keyDeletion() {
  const clip = activeClip()
  if (!clip) return undefined
  const { doc, playhead, selection } = editor.getState()
  const ui = useUi.getState()
  const range = ui.timelineRange?.clipId === clip.id ? ui.timelineRange : null
  const start = range ? Math.min(range.anchor, range.edge) : playhead.frame
  const end = range ? Math.max(range.anchor, range.edge) : playhead.frame
  let joints = selection.joints
    .filter((joint) => joint.characterId === clip.characterId)
    .map((joint) => joint.joint)
  if (range?.rowId === 'character') {
    joints = clip.tracks.map((track) => track.joint)
  } else if (range?.rowId.startsWith('joint:')) {
    const jointId = range.rowId.slice('joint:'.length)
    const index = findCharacter(doc, clip.characterId)?.skeleton.joints.findIndex(
      (joint) => joint.id === jointId,
    )
    joints = index !== undefined && index >= 0 ? [index] : []
  }
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

export function canDeleteKeys(): boolean {
  return Boolean(keyDeletion())
}

export function deleteKeys(): boolean {
  const target = keyDeletion()
  if (!target) return false
  useUi.getState().setPlaying(false)
  editor.run(deleteTransformKeys(target.clipId, target.joints, target.start, target.end))
  return true
}

export function beginTransform(joint: JointRef): void {
  const ui = useUi.getState()
  ui.setPlaying(false)
  ui.setTransformDraft({ joint, frame: keyFrame(joint), key: null })
}

export function previewTransform(key: TransformKey | null): void {
  const ui = useUi.getState()
  if (ui.transformDraft) ui.setTransformDraft({ ...ui.transformDraft, key })
}

export function finishTransform(commit: boolean): void {
  const ui = useUi.getState()
  const draft = ui.transformDraft
  ui.setTransformDraft(null)
  if (commit && draft?.key) keyTransform(draft.joint, draft.frame, draft.key)
}
