import {
  addClip,
  deleteRotationKeys,
  findCharacter,
  setRotationKey,
  type Clip,
  type JointRef,
  type Quat,
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

function keyRotation(joint: JointRef, frame: number, rotation: Quat): void {
  const clip = activeClip()
  const target = clip?.characterId === joint.characterId ? clip.id : blankClip(joint.characterId)
  editor.run(setRotationKey(target, joint.joint, frame, rotation))
  if (typeof target !== 'string') editor.setPlayhead({ clipId: target.id, frame })
}

export function keySelection(): void {
  const { doc, selection } = editor.getState()
  const joint = selection.joints.length === 1 ? selection.joints[0] : undefined
  const character = joint && findCharacter(doc, joint.characterId)
  if (!joint || !character) return
  useUi.getState().setPlaying(false)
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
  const o = joint.joint * LOCAL_STRIDE + 3
  keyRotation(joint, frame, [
    pose.local[o]!,
    pose.local[o + 1]!,
    pose.local[o + 2]!,
    pose.local[o + 3]!,
  ])
}

export function deleteKeys(): boolean {
  const clip = activeClip()
  if (!clip) return false
  const { playhead, selection } = editor.getState()
  const ui = useUi.getState()
  const range = ui.timelineRange?.clipId === clip.id ? ui.timelineRange : null
  const start = range ? Math.min(range.anchor, range.edge) : playhead.frame
  const end = range ? Math.max(range.anchor, range.edge) : playhead.frame
  const joints = selection.joints
    .filter((joint) => joint.characterId === clip.characterId)
    .map((joint) => joint.joint)
  if (
    !clip.tracks.some(
      (track) =>
        joints.includes(track.joint) &&
        track.rotations?.frames.some((frame) => frame >= start && frame <= end),
    )
  )
    return false
  ui.setPlaying(false)
  editor.run(deleteRotationKeys(clip.id, joints, start, end))
  return true
}

export function beginRotation(joint: JointRef): void {
  const ui = useUi.getState()
  ui.setPlaying(false)
  ui.setRotationDraft({ joint, frame: keyFrame(joint), rotation: null })
}

export function previewRotation(rotation: Quat | null): void {
  const ui = useUi.getState()
  if (ui.rotationDraft) ui.setRotationDraft({ ...ui.rotationDraft, rotation })
}

export function finishRotation(commit: boolean): void {
  const ui = useUi.getState()
  const draft = ui.rotationDraft
  ui.setRotationDraft(null)
  if (commit && draft?.rotation) keyRotation(draft.joint, draft.frame, draft.rotation)
}
