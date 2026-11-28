import {
  CONTROL_IDS,
  bendControl,
  controlKind,
  isEffector,
  type ControlId,
  type JointRef,
} from '@dilemma/core'
import { WORLD_STRIDE, type CompiledSkeleton, type Pose } from '@dilemma/solve'
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Camera,
} from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

type Point = [x: number, y: number]

const HIT_TOLERANCE = 6

function ellipse(width: number, height: number): Point[] {
  return Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * Math.PI * 2
    return [width * Math.cos(angle), height * Math.sin(angle)]
  })
}

const shapes = {
  hips: [
    [-14, 8],
    [14, 8],
    [19, 0],
    [14, -8],
    [-14, -8],
    [-19, 0],
  ],
  chest: ellipse(19, 9),
  head: ellipse(13, 13),
  hand: [
    [0, 12],
    [13, 0],
    [0, -12],
    [-13, 0],
  ],
  foot: [
    [-12, 7],
    [12, 7],
    [15, -7],
    [-15, -7],
  ],
  bend: [
    [0, 8],
    [8, 0],
    [0, -8],
    [-8, 0],
  ],
} satisfies Record<string, Point[]>

function controlShape(id: ControlId): Point[] {
  if (isEffector(id)) return id.endsWith('Hand') ? shapes.hand : shapes.foot
  if (id === 'hips' || id === 'chest' || id === 'head') return shapes[id]
  return shapes.bend
}

const markerMaterial = (color: string) =>
  new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, allowOverride: false })

const strokeMaterial = (color: string, linewidth: number) =>
  new LineMaterial({ color, linewidth, depthTest: false, depthWrite: false, allowOverride: false })

const controlMaterials = (color: string) => ({
  stroke: strokeMaterial(color, 2.25),
  outline: strokeMaterial(color, 5.5),
  indicator: markerMaterial(color),
})

/** Pose handles face the viewer and keep the same size on screen when the camera zooms. */
export class PoseControls {
  readonly group = new Group()
  private indicator = new CircleGeometry(3, 4)
  private colors = {
    normal: controlMaterials('#0875d2'),
    warning: controlMaterials('#ad6418'),
    pinned: controlMaterials('#12816a'),
  }
  private whiteStroke = strokeMaterial('#ffffff', 2.25)
  private whiteOutline = strokeMaterial('#ffffff', 5.5)
  private tetherMaterial = new LineBasicMaterial({
    color: '#ad6418',
    depthTest: false,
    depthWrite: false,
    allowOverride: false,
  })
  private markers = CONTROL_IDS.map((id, index) => {
    const points = controlShape(id)
    const geometry = new LineGeometry().setPositions(
      [...points, points[0]!].flatMap(([x, y]) => [x, y, 0]),
    )
    const marker = new Group()
    const stroke = new Line2(geometry, this.colors.normal.stroke)
    const outline = new Line2(geometry, this.whiteOutline)
    const indicator = new Mesh(this.indicator, this.colors.normal.indicator)
    marker.visible = false
    stroke.renderOrder = 1101
    outline.renderOrder = 1100
    indicator.renderOrder = 1102
    marker.add(outline, stroke, indicator)
    this.group.add(marker)
    const tether = isEffector(id)
      ? new Line(
          new BufferGeometry().setAttribute(
            'position',
            new BufferAttribute(new Float32Array(6), 3),
          ),
          this.tetherMaterial,
        )
      : null
    if (tether) {
      tether.visible = false
      tether.frustumCulled = false
      tether.renderOrder = 1099
      this.group.add(tether)
    }
    return { id, index, marker, stroke, outline, indicator, tether, geometry, points }
  })
  private projected = new Vector3()

  constructor(
    private characterId: string,
    private skeleton: CompiledSkeleton,
  ) {
    this.group.visible = false
  }

  update(
    pose: Pose,
    show: boolean,
    selected: ControlId | undefined,
    camera: Camera,
    height: number,
  ): void {
    this.group.visible = show && height > 0
    if (!this.group.visible) return
    const bend = selected && isEffector(selected) ? bendControl(selected) : undefined
    const unitsPerPixel = 2 / (height * camera.projectionMatrix.elements[5]!)
    const cameraInverse = camera.matrixWorldInverse
    for (const { id, index, marker, stroke, outline, indicator, tether } of this.markers) {
      const active = selected === id
      const isBend = controlKind(id) === 'bend'
      marker.visible = this.skeleton.controls[index]! >= 0 && (!isBend || active || id === bend)
      if (tether) tether.visible = false
      if (!marker.visible) continue
      marker.position.fromArray(pose.controlPositions, index * 3)
      const depth = -this.projected.copy(marker.position).applyMatrix4(cameraInverse).z
      marker.visible = depth > 0
      if (!marker.visible) continue
      marker.scale.setScalar(depth * unitsPerPixel)
      marker.quaternion.copy(camera.quaternion)
      const pinned = Boolean(pose.pinned[index])
      if (tether) {
        const offset = this.skeleton.controls[index]! * WORLD_STRIDE + 12
        this.projected.fromArray(pose.world, offset)
        // A position error below half a millimeter is invisible at posing distances.
        tether.visible = this.projected.distanceToSquared(marker.position) > 0.0005 ** 2
        if (tether.visible) {
          const points = tether.geometry.getAttribute('position')
          points.setXYZ(0, this.projected.x, this.projected.y, this.projected.z)
          points.setXYZ(1, marker.position.x, marker.position.y, marker.position.z)
          points.needsUpdate = true
        }
      }
      const color =
        this.colors[tether?.visible || isBend ? 'warning' : pinned ? 'pinned' : 'normal']
      stroke.material = active ? this.whiteStroke : color.stroke
      outline.material = active ? color.outline : this.whiteOutline
      indicator.visible = active || pinned
      indicator.material = color.indicator
    }
  }

  pick(x: number, y: number, width: number, height: number, camera: Camera) {
    if (!this.group.visible) return null
    let hit: {
      ref: JointRef
      distance: number
      depth: number
      dot: true
      outOfReach: boolean
    } | null = null
    for (const { id, index, marker, points, tether } of this.markers) {
      if (!marker.visible) continue
      const { x: px, y: py, z } = this.projected.copy(marker.position).project(camera)
      if (z < -1 || z > 1) continue
      const distance = controlDistance(
        points,
        x - ((px + 1) * width) / 2,
        ((1 - py) * height) / 2 - y,
      )
      if (distance > HIT_TOLERANCE) continue
      if (hit && (distance > hit.distance || (distance === hit.distance && z >= hit.depth)))
        continue
      hit = {
        ref: { characterId: this.characterId, joint: this.skeleton.controls[index]!, control: id },
        distance,
        depth: z,
        dot: true,
        outOfReach: Boolean(tether?.visible),
      }
    }
    return hit
  }

  dispose(): void {
    this.indicator.dispose()
    for (const { geometry, tether } of this.markers) {
      geometry.dispose()
      tether?.geometry.dispose()
    }
    for (const { stroke, outline, indicator } of Object.values(this.colors)) {
      stroke.dispose()
      outline.dispose()
      indicator.dispose()
    }
    this.tetherMaterial.dispose()
    this.whiteStroke.dispose()
    this.whiteOutline.dispose()
  }
}

function controlDistance(points: Point[], x: number, y: number): number {
  // Keep the pivot easy to grab as well as the visible stroke.
  let distance = Math.hypot(x, y)
  let a = points[points.length - 1]!
  for (const b of points) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const along = Math.max(
      0,
      Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
    )
    distance = Math.min(distance, Math.hypot(x - a[0] - along * dx, y - a[1] - along * dy))
    a = b
  }
  return distance
}
