import { findCharacter, selectedControl, type EditorState } from '@dilemma/core'
import { compileClip, compileSkeleton, createPose, solvePose, WORLD_STRIDE } from '@dilemma/solve'
import type { MotionTrailData, TransformMode } from '@dilemma/view'
import { resolveWorkArea, useUi } from './ui-store.ts'

export function motionTrailTarget({ doc, playhead, selection }: EditorState) {
  const joint = selection.joints.length === 1 ? selection.joints[0] : undefined
  const clip = doc.clips.find(({ id }) => id === playhead.clipId)
  if (!joint || !clip || clip.characterId !== joint.characterId) return undefined
  const character = findCharacter(doc, joint.characterId)
  if (character) return { character, clip, joint }
}

export function sampleMotionTrail(
  state: EditorState,
  workArea: ReturnType<typeof useUi.getState>['workArea'],
  mode: TransformMode,
): MotionTrailData | null {
  const target = motionTrailTarget(state)
  if (!target) return null
  const { character, clip, joint } = target
  const { start, end } = resolveWorkArea(clip, state.doc.sceneTiming, workArea)
  const control =
    mode === 'ik' ? selectedControl(character.skeleton, character.rig, joint) : undefined
  const fk = clip.tracks.find((track) => track.joint === joint.joint)
  const keys = new Set<number>()
  for (const frames of [
    fk?.translations?.frames,
    fk?.rotations?.frames,
    fk?.scales?.frames,
    control ? clip.controls?.[control]?.frames : undefined,
    clip.limb?.tip === joint.joint ? clip.limb.targets.frames : undefined,
  ]) {
    for (const frame of frames ?? []) {
      if (frame >= start && frame <= end) keys.add(frame)
    }
  }

  // Bound solver work for long clips while retaining the endpoints and sampled keys.
  const keyFrames = [...keys].toSorted((a, b) => a - b)
  const keyStep = Math.max(1, Math.ceil(keyFrames.length / 120))
  const marked = new Set(
    keyFrames.filter((_, index) => index % keyStep === 0 || index === keyFrames.length - 1),
  )
  const samples = new Set([end, ...marked])
  const step = Math.max(1, Math.ceil((end - start) / 240))
  for (let frame = start; frame < end; frame += step) samples.add(frame)

  const skeleton = compileSkeleton(character.skeleton, character.rig)
  const compiled = compileClip(clip, skeleton.count)
  const pose = createPose(skeleton)
  const points = new Float32Array(samples.size * 3)
  const keyPoints = new Float32Array(marked.size * 3)
  const worldOffset = joint.joint * WORLD_STRIDE + 12
  let offset = 0
  let keyOffset = 0
  for (const frame of [...samples].toSorted((a, b) => a - b)) {
    solvePose(skeleton, compiled, frame, pose)
    const point = pose.world.subarray(worldOffset, worldOffset + 3)
    points.set(point, offset)
    offset += 3
    if (marked.has(frame)) {
      keyPoints.set(point, keyOffset)
      keyOffset += 3
    }
  }
  return { joint, start, end, points, keyPoints }
}
