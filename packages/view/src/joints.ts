import { RIG_ROLES } from '@dilemma/core'
import { WORLD_STRIDE, type CompiledSkeleton, type Pose } from '@dilemma/solve'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
} from 'three'

const IDLE = new Color('#0c8ce9')
const SELECTED = new Color('#fab94c')

/** Draws a skeleton as dots and parent-child lines, on top of the mesh. */
export class JointOverlay {
  readonly group = new Group()
  private dots: InstancedMesh
  private lines: LineSegments
  private preview: InstancedMesh<SphereGeometry, MeshBasicMaterial>
  private positions: Float32Array
  private matrix = new Matrix4()
  private point = new Vector3()

  constructor(
    private skeleton: CompiledSkeleton,
    radius: number,
  ) {
    const count = skeleton.count
    this.dots = new InstancedMesh(
      new SphereGeometry(radius, 10, 6),
      new MeshBasicMaterial({
        allowOverride: false,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      }),
      count,
    )
    this.dots.instanceMatrix.setUsage(DynamicDrawUsage)
    this.dots.renderOrder = 1001
    this.dots.frustumCulled = false
    for (let i = 0; i < count; i++) this.dots.setColorAt(i, IDLE)

    this.positions = new Float32Array(count * 6)
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    )
    this.lines = new LineSegments(
      geometry,
      new LineBasicMaterial({
        allowOverride: false,
        color: IDLE,
        depthTest: false,
        transparent: true,
        opacity: 0.6,
      }),
    )
    this.lines.renderOrder = 1000
    this.lines.frustumCulled = false
    this.preview = new InstancedMesh(
      new SphereGeometry(1, 14, 10),
      new MeshBasicMaterial({
        color: SELECTED,
        depthTest: false,
        depthWrite: false,
        allowOverride: false,
      }),
      RIG_ROLES.length,
    )
    this.preview.renderOrder = 1002
    this.preview.frustumCulled = false
    this.preview.visible = false
    this.group.add(this.lines, this.dots, this.preview)
  }

  update(
    pose: Pose,
    showSkeleton: boolean,
    previewJoints: readonly number[] | undefined,
    camera: PerspectiveCamera,
    viewportHeight: number,
  ): void {
    this.group.visible = showSkeleton || Boolean(previewJoints?.length)
    this.lines.visible = showSkeleton
    this.dots.visible = showSkeleton
    this.preview.visible = Boolean(previewJoints?.length)
    const w = pose.world
    if (previewJoints?.length) {
      const slope = Math.tan((camera.getEffectiveFOV() * Math.PI) / 360)
      const radiusPerDepth = (2 * slope * 6) / Math.max(1, viewportHeight)
      this.preview.count = previewJoints.length
      for (const [index, joint] of previewJoints.entries()) {
        const offset = joint * WORLD_STRIDE + 12
        const depth = -this.point.fromArray(w, offset).applyMatrix4(camera.matrixWorldInverse).z
        const radius = Math.max(depth, 0) * radiusPerDepth
        this.matrix.makeScale(radius, radius, radius)
        this.matrix.setPosition(this.point.fromArray(w, offset))
        this.preview.setMatrixAt(index, this.matrix)
      }
      this.preview.instanceMatrix.needsUpdate = true
    }
    if (!showSkeleton) return
    const { count, parents } = this.skeleton
    for (let i = 0; i < count; i++) {
      const o = i * WORLD_STRIDE
      this.matrix.makeTranslation(w[o + 12]!, w[o + 13]!, w[o + 14]!)
      this.dots.setMatrixAt(i, this.matrix)
      const p = parents[i]!
      const l = i * 6
      const po = (p >= 0 ? p : i) * WORLD_STRIDE
      this.positions[l] = w[po + 12]!
      this.positions[l + 1] = w[po + 13]!
      this.positions[l + 2] = w[po + 14]!
      this.positions[l + 3] = w[o + 12]!
      this.positions[l + 4] = w[o + 13]!
      this.positions[l + 5] = w[o + 14]!
    }
    this.dots.instanceMatrix.needsUpdate = true
    this.lines.geometry.attributes['position']!.needsUpdate = true
  }

  setSelected(selected: ReadonlySet<number>): void {
    for (let i = 0; i < this.skeleton.count; i++) {
      this.dots.setColorAt(i, selected.has(i) ? SELECTED : IDLE)
    }
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.preview.material.dispose()
    this.preview.geometry.dispose()
    this.preview.dispose()
    this.dots.geometry.dispose()
    ;(this.dots.material as MeshBasicMaterial).dispose()
    this.dots.dispose()
    this.lines.geometry.dispose()
    ;(this.lines.material as LineBasicMaterial).dispose()
  }
}
