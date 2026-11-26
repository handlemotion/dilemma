import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Ray,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { MeshPicker } from './picking.ts'

/** A strip two units tall: the lower half weighted to the root, the upper to the elbow. */
function arm() {
  const geometry = new BufferGeometry()
  const ys = [0, 0, 1, 1, 2, 2]
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      ys.flatMap((y, i) => [i % 2 === 0 ? -0.2 : 0.2, y, 0]),
      3,
    ),
  )
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4])
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute(
      ys.flatMap((y) => [y < 1 ? 0 : 1, 0, 0, 0]),
      4,
    ),
  )
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(
      ys.flatMap(() => [1, 0, 0, 0]),
      4,
    ),
  )
  const root = new Bone()
  const elbow = new Bone()
  elbow.position.y = 1
  root.add(elbow)
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
  mesh.add(root)
  mesh.bind(new Skeleton([root, elbow]))
  mesh.updateMatrixWorld(true)
  return { mesh, bones: [root, elbow] }
}

const toward = (y: number, x = 0) => new Ray(new Vector3(x, y, 5), new Vector3(0, 0, -1))

describe('MeshPicker', () => {
  it('picks the bone that weighs most where the mesh is hit', () => {
    const { mesh, bones } = arm()
    const picker = new MeshPicker(mesh, bones)
    expect(picker.pick(toward(0.1))?.joint).toBe(0)
    expect(picker.pick(toward(1.9))?.joint).toBe(1)
    expect(picker.pick(toward(1, 3))).toBeNull()
  })

  it('follows the pose after the bones move', () => {
    const { mesh, bones } = arm()
    const picker = new MeshPicker(mesh, bones)
    expect(picker.pick(toward(1.9))?.joint).toBe(1)
    // Fold the elbow down flat along +X: the upper half leaves y = 1.9.
    bones[1]!.rotation.z = -Math.PI / 2
    mesh.updateMatrixWorld(true)
    expect(picker.pick(toward(1.9))).toBeNull()
    expect(picker.pick(new Ray(new Vector3(0.8, 1.05, 5), new Vector3(0, 0, -1)))?.joint).toBe(1)
  })
})
