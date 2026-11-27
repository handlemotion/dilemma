import { compileClip, compileSkeleton, createPose, solvePose, WORLD_STRIDE } from '@dilemma/solve'
import {
  AnimationMixer,
  LoopOnce,
  Matrix4,
  Vector3,
  type AnimationClip,
  type Object3D,
  type SkinnedMesh,
} from 'three'
import type { ImportedCharacter } from './gltf.ts'

export interface Divergence {
  /** Largest joint position difference, meters. */
  joint: number
  /** Largest skinned vertex position difference, meters. */
  vertex: number
}

/**
 * Compares Dilemma's solved pose against three.js playing the original
 * animation on a second, untouched copy of the same file. Checks joint world
 * positions and skinned vertex positions at every integer frame.
 */
export function compareWithThree(
  imported: ImportedCharacter,
  reference: { root: Object3D; animations: AnimationClip[] },
): Divergence {
  const skeleton = compileSkeleton(imported.character.skeleton)
  const pose = createPose(skeleton)
  const referenceJoints = jointsInOrder(reference.root)
  const ourMeshes = skinnedMeshes(imported.assets.root)
  const referenceMeshes = skinnedMeshes(reference.root)
  for (const bone of imported.assets.bones) {
    bone.matrixAutoUpdate = false
    bone.matrixWorldAutoUpdate = false
  }

  const worst: Divergence = { joint: 0, vertex: 0 }
  const a = new Vector3()
  const b = new Vector3()
  const m = new Matrix4()

  const compare = (clipIndex: number | null, frame: number) => {
    const clip = clipIndex === null ? null : imported.clips[clipIndex]!
    solvePose(skeleton, clip ? compileClip(clip, skeleton.count) : null, frame, pose)
    imported.assets.bones.forEach((bone, i) =>
      bone.matrixWorld.fromArray(pose.world, i * WORLD_STRIDE),
    )
    imported.assets.root.updateMatrixWorld(true)

    const mixer = new AnimationMixer(reference.root)
    if (clip && clipIndex !== null) {
      const action = mixer.clipAction(reference.animations[clipIndex]!)
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      mixer.setTime(frame / clip.fps)
    }
    reference.root.updateMatrixWorld(true)

    referenceJoints.forEach((node, i) => {
      a.setFromMatrixPosition(m.fromArray(pose.world, i * WORLD_STRIDE))
      b.setFromMatrixPosition(node.matrixWorld)
      worst.joint = Math.max(worst.joint, a.distanceTo(b))
    })
    ourMeshes.forEach((mesh, k) => {
      const ref = referenceMeshes[k]!
      const count = mesh.geometry.attributes['position']!.count
      for (let v = 0; v < count; v++) {
        mesh.getVertexPosition(v, a)
        mesh.applyBoneTransform(v, a).applyMatrix4(mesh.matrixWorld)
        ref.getVertexPosition(v, b)
        ref.applyBoneTransform(v, b).applyMatrix4(ref.matrixWorld)
        worst.vertex = Math.max(worst.vertex, a.distanceTo(b))
      }
    })
    mixer.stopAllAction()
    mixer.uncacheRoot(reference.root)
  }

  compare(null, 0)
  imported.clips.forEach((clip, ci) => {
    for (let f = clip.start; f <= clip.end; f++) compare(ci, f)
  })
  return worst
}

function skinnedMeshes(root: Object3D): SkinnedMesh[] {
  const out: SkinnedMesh[] = []
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh)
  })
  return out
}

/** Same joint order as the importer: skin bones in traversal order. */
function jointsInOrder(root: Object3D): Object3D[] {
  const set = new Set<Object3D>()
  for (const mesh of skinnedMeshes(root)) for (const bone of mesh.skeleton.bones) set.add(bone)
  const out: Object3D[] = []
  root.traverse((o) => {
    if (set.has(o)) out.push(o)
  })
  return out
}
