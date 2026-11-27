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
  SphereGeometry,
} from 'three'

const IDLE = new Color('#0c8ce9')
const SELECTED = new Color('#fab94c')

/** Draws a skeleton as dots and parent-child lines, on top of the mesh. */
export class JointOverlay {
  readonly group = new Group()
  private dots: InstancedMesh
  private lines: LineSegments
  private positions: Float32Array
  private matrix = new Matrix4()

  constructor(
    private skeleton: CompiledSkeleton,
    radius: number,
  ) {
    const count = skeleton.count
    this.dots = new InstancedMesh(
      new SphereGeometry(radius, 10, 6),
      new MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0.9 }),
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
      new LineBasicMaterial({ color: IDLE, depthTest: false, transparent: true, opacity: 0.6 }),
    )
    this.lines.renderOrder = 1000
    this.lines.frustumCulled = false
    this.group.add(this.lines, this.dots)
  }

  update(pose: Pose): void {
    const { count, parents } = this.skeleton
    const w = pose.world
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
    this.dots.geometry.dispose()
    ;(this.dots.material as MeshBasicMaterial).dispose()
    this.dots.dispose()
    this.lines.geometry.dispose()
    ;(this.lines.material as LineBasicMaterial).dispose()
  }
}
