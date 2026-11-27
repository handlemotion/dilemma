import type { Clip } from '@dilemma/core'
import { AnimationClip, Matrix4, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { collectJoints, type CharacterAssets } from './gltf.ts'

const LOCAL_STRIDE = 10

/** Bakes the editor's local joint poses onto a copy of the imported skin. */
export async function exportGlb(
  assets: CharacterAssets,
  clip: Clip,
  sampleLocals: (frame: number) => Float64Array,
): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
  const root = clone(assets.root)
  const bones = collectJoints(root)
  const jointNodes = new Set(bones)
  const times = Float32Array.from({ length: clip.end - clip.start + 1 }, (_, i) => i / clip.fps)
  const identity = new Matrix4()
  const tracks = bones.map((bone) => {
    // The solver's parents are joints. glTF animation targets the actual node parent.
    const between = new Matrix4()
    for (let node = bone.parent; node && !jointNodes.has(node); node = node.parent) {
      if (node.matrixAutoUpdate) node.updateMatrix()
      between.premultiply(node.matrix)
    }
    if (!between.determinant())
      throw new Error(`Cannot export ${bone.name} under a zero-scale node.`)
    return {
      inverse: between.equals(identity) ? null : between.invert(),
      positions: new Float32Array(times.length * 3),
      rotations: new Float32Array(times.length * 4),
      scales: new Float32Array(times.length * 3),
    }
  })

  const local = new Matrix4()
  const checked = new Matrix4()
  const position = root.position.clone()
  const rotation = root.quaternion.clone()
  const previous = rotation.clone()
  const scale = root.scale.clone()
  for (let sample = 0; sample < times.length; sample++) {
    const pose = sampleLocals(clip.start + sample)
    for (let i = 0; i < bones.length; i++) {
      const track = tracks[i]!
      const offset = i * LOCAL_STRIDE
      position.fromArray(pose, offset)
      rotation.fromArray(pose, offset + 3)
      scale.fromArray(pose, offset + 7)
      if (track.inverse) {
        local.compose(position, rotation, scale).premultiply(track.inverse)
        local.decompose(position, rotation, scale)
        rotation.normalize()
        checked.compose(position, rotation, scale)
        if (
          checked.elements.some(
            (value, k) =>
              !Number.isFinite(value) ||
              Math.abs(value - local.elements[k]!) >
                1e-5 * Math.max(1, Math.abs(local.elements[k]!)),
          )
        ) {
          throw new Error(
            `The pose for ${bones[i]!.name} cannot be represented as glTF transforms.`,
          )
        }
      }
      if (sample && rotation.dot(previous.fromArray(track.rotations, (sample - 1) * 4)) < 0) {
        rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w)
      }
      position.toArray(track.positions, sample * 3)
      rotation.toArray(track.rotations, sample * 4)
      scale.toArray(track.scales, sample * 3)
    }
  }

  const animation = new AnimationClip(
    clip.name,
    -1,
    bones.flatMap((bone, i) => {
      const track = tracks[i]!
      return [
        new VectorKeyframeTrack(`${bone.uuid}.position`, times, track.positions),
        new QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, track.rotations),
        new VectorKeyframeTrack(`${bone.uuid}.scale`, times, track.scales),
      ]
    }),
  )
  const bytes = await new GLTFExporter().parseAsync(root, {
    animations: [animation],
    binary: true,
    onlyVisible: false,
  })
  if (!(bytes instanceof ArrayBuffer))
    throw new Error('The GLB exporter did not return binary data.')
  return bytes
}
