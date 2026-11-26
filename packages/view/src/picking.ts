import { MeshBVH, StaticGeometryGenerator } from 'three-mesh-bvh'
import {
  BufferGeometry,
  DoubleSide,
  Vector3,
  type Object3D,
  type Ray,
  type SkinnedMesh,
} from 'three'

interface Posed {
  generator: StaticGeometryGenerator
  geometry: BufferGeometry
  bvh: MeshBVH
}

export interface MeshHit {
  /** Joint index: the bone that weighs most on the vertex nearest the hit. */
  joint: number
  distance: number
}

/**
 * Picks a joint by clicking the skinned mesh. The mesh is posed into a static copy with
 * three-mesh-bvh, which is refit rather than rebuilt on later picks, and the bone that
 * weighs most on the nearest vertex of the hit triangle is the joint.
 */
export class MeshPicker {
  private posed = new Map<SkinnedMesh, Posed>()
  private meshes: SkinnedMesh[] = []
  private boneIndex = new Map<Object3D, number>()

  constructor(root: Object3D, bones: Object3D[]) {
    root.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) this.meshes.push(o as SkinnedMesh)
    })
    bones.forEach((bone, i) => this.boneIndex.set(bone, i))
  }

  pick(ray: Ray): MeshHit | null {
    let best: MeshHit | null = null
    for (const mesh of this.meshes) {
      if (!mesh.visible) continue
      const posed = this.pose(mesh)
      const hit = posed.bvh.raycastFirst(ray, DoubleSide)
      if (!hit?.face || (best && hit.distance >= best.distance)) continue
      const joint = this.heaviestBone(mesh, posed.geometry, hit.point, hit.face)
      if (joint !== null) best = { joint, distance: hit.distance }
    }
    return best
  }

  dispose(): void {
    for (const { geometry } of this.posed.values()) geometry.dispose()
    this.posed.clear()
  }

  private pose(mesh: SkinnedMesh): Posed {
    // The generator tells a new pose by the skeleton's bone matrices, which only change
    // once the skeleton is updated: normally at render, so here first.
    mesh.skeleton.update()
    let posed = this.posed.get(mesh)
    if (!posed) {
      const generator = new StaticGeometryGenerator(mesh)
      generator.applyWorldTransforms = true
      const geometry = generator.generate()
      posed = { generator, geometry, bvh: new MeshBVH(geometry) }
      this.posed.set(mesh, posed)
    } else {
      posed.generator.generate(posed.geometry)
      posed.bvh.refit()
    }
    return posed
  }

  private heaviestBone(
    mesh: SkinnedMesh,
    posed: BufferGeometry,
    point: Vector3,
    face: { a: number; b: number; c: number },
  ): number | null {
    const positions = posed.attributes['position']!
    const v = new Vector3()
    let nearest = face.a
    let nearestDistance = Infinity
    for (const index of [face.a, face.b, face.c]) {
      const d = v.fromBufferAttribute(positions, index).distanceToSquared(point)
      if (d < nearestDistance) {
        nearestDistance = d
        nearest = index
      }
    }
    const skinIndex = mesh.geometry.attributes['skinIndex']
    const skinWeight = mesh.geometry.attributes['skinWeight']
    if (!skinIndex || !skinWeight) return null
    let bone = -1
    let weight = -1
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(nearest, k)
      if (w > weight) {
        weight = w
        bone = skinIndex.getComponent(nearest, k)
      }
    }
    const object = mesh.skeleton.bones[bone]
    return object ? (this.boneIndex.get(object) ?? null) : null
  }
}
